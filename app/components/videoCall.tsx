"use client";

import { useEffect, useRef } from "react";

export default function VideoCall() {
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);

  const peer = useRef<RTCPeerConnection | null>(null);
  const socket = useRef<WebSocket | null>(null);

  const isCaller = useRef(false);

  useEffect(() => {
    peer.current = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    socket.current = new WebSocket(
      "wss://video-call-app-production-b7d6.up.railway.app",
    );

    socket.current.onmessage = async (event) => {
      const data = JSON.parse(event.data);

      console.log("📩 SIGNAL:", data);

      if (data.offer && !isCaller.current) {
        await peer.current?.setRemoteDescription(data.offer);
        const answer = await peer.current?.createAnswer();
        await peer.current?.setLocalDescription(answer!);
        socket.current?.send(JSON.stringify({ answer }));
      }

      if (data.answer && isCaller.current) {
        await peer.current?.setRemoteDescription(data.answer);
      }

      if (data.candidate) {
        await peer.current?.addIceCandidate(data.candidate);
      }
    };

    peer.current.onicecandidate = (event) => {
      if (event.candidate) {
        socket.current?.send(JSON.stringify({ candidate: event.candidate }));
      }
    };

    peer.current.ontrack = (event) => {
      if (remoteVideo.current) {
        remoteVideo.current.srcObject = event.streams[0];
      }
    };

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        if (localVideo.current) {
          localVideo.current.srcObject = stream;
        }
        stream.getTracks().forEach((track) => {
          peer.current?.addTrack(track, stream);
        });
      });

    return () => {
      peer.current?.close();
      socket.current?.close();
    };
  }, []);

  const startCall = async () => {
    isCaller.current = true;

    const offer = await peer.current?.createOffer();
    await peer.current?.setLocalDescription(offer!);

    socket.current?.send(JSON.stringify({ offer }));
  };

  return (
    <div>
      <div className="flex gap-4">
        <video ref={localVideo} autoPlay muted className="w-64" />
        <video ref={remoteVideo} autoPlay className="w-64" />
      </div>

      <button
        onClick={startCall}
        className="mt-4 bg-black text-white px-4 py-2 rounded"
      >
        Start Call
      </button>
    </div>
  );
}
