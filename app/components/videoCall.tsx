"use client";

import { useCallback, useRef, useState } from "react";

const ROOM_ID = "room-1";

export default function VideoCall() {
  const localVideo = useRef<HTMLVideoElement>(null);
  const socket = useRef<WebSocket | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const peers = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingCandidates = useRef<Map<string, RTCIceCandidateInit[]>>(
    new Map(),
  );

  const audioContextRef = useRef<AudioContext | null>(null);

  const userId = useRef(crypto.randomUUID());

  const [callStarted, setCallStarted] = useState(false);
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<
    { userId: string; stream: MediaStream }[]
  >([]);

  /* ================= AUDIO DETECTION ================= */

  const startAudioDetection = (uid: string, stream: MediaStream) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }

    const ctx = audioContextRef.current;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;

    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);

    const loop = () => {
      analyser.getByteFrequencyData(data);
      const volume = data.reduce((sum, v) => sum + v, 0) / data.length;

      if (volume > 25) setActiveSpeaker(uid);
      requestAnimationFrame(loop);
    };

    loop();
  };

  /* ================= MEDIA ================= */

  const initMedia = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    localStreamRef.current = stream;

    if (localVideo.current) {
      localVideo.current.srcObject = stream;
    }

    return stream;
  };

  /* ================= PEER ================= */

  const createPeer = useCallback(
    async (remoteUserId: string, isCaller: boolean) => {
      if (peers.current.has(remoteUserId)) return;

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });

      peers.current.set(remoteUserId, pc);

      const localStream = localStreamRef.current;
      if (!localStream) return;

      localStream
        .getTracks()
        .forEach((track) => pc.addTrack(track, localStream));

      pc.ontrack = (e) => {
        // eslint-disable-next-line prefer-const
        let existing = remoteStreams.find((r) => r.userId === remoteUserId);

        let stream = existing?.stream;

        if (!stream) {
          stream = new MediaStream();

          setRemoteStreams((prev) => [
            ...prev,
            { userId: remoteUserId, stream: stream as MediaStream },
          ]);

          startAudioDetection(remoteUserId, stream);
        }

        stream.addTrack(e.track);
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          socket.current?.send(
            JSON.stringify({
              type: "signal",
              from: userId.current,
              to: remoteUserId,
              candidate: e.candidate,
            }),
          );
        }
      };

      if (isCaller) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socket.current?.send(
          JSON.stringify({
            type: "signal",
            from: userId.current,
            to: remoteUserId,
            offer,
          }),
        );
      }
    },
    [remoteStreams],
  );

  /* ================= CALL ================= */

  const startCall = async () => {
    if (callStarted) return;

    await initMedia();

    socket.current = new WebSocket(
      "wss://signaling-server-production-339e.up.railway.app",
    );

    socket.current.onopen = () => {
      socket.current?.send(
        JSON.stringify({
          type: "join",
          roomId: ROOM_ID,
          userId: userId.current,
        }),
      );
      setCallStarted(true);
    };

    socket.current.onmessage = async (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "existing-users") {
        data.users.forEach((uid: string) => {
          createPeer(uid, true);
        });
      }

      if (data.type === "user-joined") {
        createPeer(data.userId, true);
      }

      if (data.type === "signal") {
        let pc = peers.current.get(data.from);

        if (data.offer) {
          if (!pc) {
            await createPeer(data.from, false);
            pc = peers.current.get(data.from)!;
          }

          await pc.setRemoteDescription(data.offer);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          socket.current?.send(
            JSON.stringify({
              type: "signal",
              from: userId.current,
              to: data.from,
              answer,
            }),
          );

          const queued = pendingCandidates.current.get(data.from) || [];
          for (const c of queued) await pc.addIceCandidate(c);
          pendingCandidates.current.delete(data.from);
        }

        if (data.answer && pc) {
          await pc.setRemoteDescription(data.answer);

          const queued = pendingCandidates.current.get(data.from) || [];
          for (const c of queued) await pc.addIceCandidate(c);
          pendingCandidates.current.delete(data.from);
        }

        if (data.candidate && pc) {
          if (pc.remoteDescription) {
            await pc.addIceCandidate(data.candidate);
          } else {
            const list = pendingCandidates.current.get(data.from) || [];
            list.push(data.candidate);
            pendingCandidates.current.set(data.from, list);
          }
        }
      }

      if (data.type === "user-left") {
        peers.current.get(data.userId)?.close();
        peers.current.delete(data.userId);

        setRemoteStreams((prev) =>
          prev.filter((r) => r.userId !== data.userId),
        );
      }
    };
  };

  /* ================= UI ================= */

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Video Call</h1>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <h2 className="font-semibold">Local</h2>
          <video
            ref={localVideo}
            autoPlay
            muted
            playsInline
            className="w-full border"
          />
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

      {!callStarted && (
        <button
          onClick={startCall}
          className="mt-4 px-4 py-2 bg-black text-white rounded"
        >
          Start Call
        </button>
      )}

      {activeSpeaker && (
        <div className="mt-4 p-4 border border-green-500 bg-green-100">
          Active Speaker: {activeSpeaker}
        </div>
      )}
    </div>
  );
}
