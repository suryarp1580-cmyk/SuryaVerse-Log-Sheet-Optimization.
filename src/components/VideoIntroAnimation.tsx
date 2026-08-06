import React, { useState, useEffect, useRef } from 'react';
import { VolumeX, Volume2 } from 'lucide-react';

interface VideoIntroAnimationProps {
  onComplete: () => void;
}

const LANDSCAPE_VIDEO_URL = "https://res.cloudinary.com/oomxhs6j/video/upload/v1786041848/ACCFIN_logo_opening_animation_202608070013_online-video-cutter.com_ggdior.mp4";
const PORTRAIT_VIDEO_URL = "https://res.cloudinary.com/oomxhs6j/video/upload/v1786028475/ACCFIN_logo_animation_wgbtp9.mp4";

export default function VideoIntroAnimation({ onComplete }: VideoIntroAnimationProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showSoundPrompt, setShowSoundPrompt] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const checkScreen = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkScreen();
    window.addEventListener('resize', checkScreen);
    return () => window.removeEventListener('resize', checkScreen);
  }, []);

  const videoSrc = isMobile ? PORTRAIT_VIDEO_URL : LANDSCAPE_VIDEO_URL;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // First attempt unmuted play
    video.muted = false;
    setIsMuted(false);
    setShowSoundPrompt(false);

    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        console.log('Unmuted video play blocked by browser policy:', err);
        // Fallback to muted playback and prompt user to enable sound
        video.muted = true;
        setIsMuted(true);
        setShowSoundPrompt(true);
        video.play().catch((e) => console.log('Muted fallback failed:', e));
      });
    }
  }, [videoSrc]);

  const handleContainerClick = () => {
    const video = videoRef.current;
    if (video && isMuted) {
      // Unmute and restart with full sound upon user gesture
      video.muted = false;
      video.currentTime = 0;
      setIsMuted(false);
      setShowSoundPrompt(false);
      video.play().catch((e) => console.log('Play after user click error:', e));
    } else {
      onComplete();
    }
  };

  return (
    <div 
      onClick={handleContainerClick}
      className="fixed inset-0 z-[100] bg-black flex items-center justify-center overflow-hidden font-sans select-none cursor-pointer"
    >
      <video
        ref={videoRef}
        src={videoSrc}
        autoPlay
        playsInline
        onEnded={onComplete}
        className={`w-full h-full ${isMobile ? 'object-cover' : 'object-contain max-h-screen'}`}
      />

      {/* Sound Prompt Overlay if browser prevented unmuted autoplay */}
      {showSoundPrompt && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <div className="flex items-center gap-2 bg-black/80 backdrop-blur-md border border-amber-500/40 text-amber-300 text-xs font-semibold px-4 py-2 rounded-full shadow-2xl animate-pulse">
            <VolumeX className="w-4 h-4 text-amber-400" />
            <span>Tap anywhere to enable sound</span>
          </div>
        </div>
      )}

      {/* Audio Indicator */}
      {!showSoundPrompt && !isMuted && (
        <div className="absolute top-6 right-6 z-10 pointer-events-none">
          <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md border border-white/20 text-white/90 text-[11px] font-medium px-3 py-1.5 rounded-full">
            <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Audio Active</span>
          </div>
        </div>
      )}
    </div>
  );
}
