"use client";

import { useEffect, useRef, useState } from "react";

const ROOM_ID = "room-1";

export default function VideoCall() {
  const localVideo = useRef<HTMLVideoElement>(null);
  const socket = useRef<WebSocket | null>(null);
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null);


  const peers = useRef<Map<string, RTCPeerConnection>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);

  const startAudioDetection = (userId: string, stream: MediaStream) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }

    const audioContext = audioContextRef.current;
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);

    const checkVolume = () => {
      analyser.getByteFrequencyData(data);

      const volume = data.reduce((sum, value) => sum + value, 0) / data.length;

      if (volume > 25) {
        setActiveSpeaker(userId);
      }

      requestAnimationFrame(checkVolume);
    };

    checkVolume();
  };

  const [remoteStreams, setRemoteStreams] = useState<
    { userId: string; stream: MediaStream }[]
  >([]);

  const userId = useRef(crypto.randomUUID());

  const createPeer = async (remoteUserId: string, isCaller: boolean) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    peers.current.set(remoteUserId, pc);

    const stream = localVideo.current!.srcObject as MediaStream;
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

   pc.ontrack = (e) => {
     const stream = e.streams[0];

     setRemoteStreams((prev) => [...prev, { userId: remoteUserId, stream }]);

     // 👇 THIS IS WHERE AUDIO CHECKING STARTS
     startAudioDetection(remoteUserId, stream);
   };


    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.current?.send(
          JSON.stringify({
            type: "signal",
            to: remoteUserId,
            from: userId.current,
            candidate: e.candidate,
          })
        );
      }
    };

    if (isCaller) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.current?.send(
        JSON.stringify({
          type: "signal",
          to: remoteUserId,
          from: userId.current,
          offer,
        })
      );
    }
  };

  useEffect(() => {
    socket.current = new WebSocket(
      "wss://signaling-server-production-339e.up.railway.app",
    );

    socket.current.onopen = () => {
      socket.current?.send(
        JSON.stringify({
          type: "join",
          roomId: ROOM_ID,
          userId: userId.current,
        })
      );
    };

    socket.current.onmessage = async (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "user-joined") {
        createPeer(data.userId, true);
      }

      if (data.type === "signal") {
        const pc = peers.current.get(data.from);

        if (data.offer) {
          await pc?.setRemoteDescription(data.offer);
          const answer = await pc?.createAnswer();
          await pc?.setLocalDescription(answer!);

          socket.current?.send(
            JSON.stringify({
              type: "signal",
              to: data.from,
              from: userId.current,
              answer,
            })
          );
        }

        if (data.answer) {
          await pc?.setRemoteDescription(data.answer);
        }

        if (data.candidate) {
          await pc?.addIceCandidate(data.candidate);
        }
      }
    };

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        localVideo.current!.srcObject = stream;
      });
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Video Call</h1>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <h2 className="text-lg font-semibold">Local Video</h2>
          <video
            ref={localVideo}
            autoPlay
            muted
            className="w-full h-auto border"
          ></video>
        </div>
        {remoteStreams.map(({ userId, stream }) => (
          <video
            key={userId}
            autoPlay
            playsInline
            ref={(el) => {
              if (el) el.srcObject = stream;
            }}
            className={`w-48 border rounded ${
              activeSpeaker === userId
                ? "border-green-500 border-4"
                : "border-gray-300"
            }`}
          />
        ))}
      </div>

      {activeSpeaker && (
        <div className="mt-4 p-4 border border-green-500 bg-green-100">
          <h2 className="text-lg font-semibold">Active Speaker</h2>
          <p>User ID: {activeSpeaker}</p>
        </div>
      )}
    </div>
  );
}