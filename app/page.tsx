"use client";

import VideoCall from "./components/videoCall";


export default function Home() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">Video Call App</h1>
      <p className="text-lg">Welcome to the video call application!</p>
      <VideoCall />
    </main>
  );
}
