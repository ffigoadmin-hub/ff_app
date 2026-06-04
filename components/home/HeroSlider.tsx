'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BannerSlide } from '@/app/api/banners/route';

const FALLBACK_SLIDES: BannerSlide[] = [
  { id: 'f1', title: 'Farmers Factory', headline: 'Farm-to-Door\nFreshness', subtitle: 'Organic vegetables, grains & dairy direct from Karnataka farms', ctaText: 'Shop Farm Fresh', ctaLink: '/category/vegetables', imageUrl: '', videoUrl: '', screenshot1: '', screenshot2: '', bgGradient: 'from-emerald-700 via-green-600 to-teal-600', sortOrder: 0 },
  { id: 'f2', title: 'Valluvam Products', headline: 'Traditional\nTaste of Tamil Nadu', subtitle: 'Cold-pressed oils, country sugar, traditional rice varieties & pickles', ctaText: 'Shop Traditional', ctaLink: '/category/valluvam-products', imageUrl: '', videoUrl: '', screenshot1: '', screenshot2: '', bgGradient: 'from-orange-600 via-amber-600 to-yellow-600', sortOrder: 1 },
  { id: 'f3', title: '24-Hour Delivery', headline: 'Order Today\nGet Tomorrow', subtitle: 'Fresh produce harvested daily, delivered to your door within 24 hours', ctaText: 'Order Now', ctaLink: '/', imageUrl: '', videoUrl: '', screenshot1: '', screenshot2: '', bgGradient: 'from-blue-700 via-indigo-600 to-violet-700', sortOrder: 2 },
];

const SLIDE_INTERVAL = 6000;

function ctaAccent(bg: string): string {
  if (bg.includes('orange') || bg.includes('amber')) return 'bg-white text-orange-700';
  if (bg.includes('lime') || bg.includes('emerald')) return 'bg-orange-400 text-orange-900';
  if (bg.includes('blue') || bg.includes('indigo'))  return 'bg-green-400 text-green-900';
  return 'bg-yellow-400 text-yellow-900';
}

function slideEmoji(bg: string): string {
  if (bg.includes('orange') || bg.includes('amber')) return '🫙';
  if (bg.includes('lime'))                           return '🌱';
  if (bg.includes('blue') || bg.includes('indigo'))  return '🚚';
  return '🥦';
}

function SlideBackground({ slide, active }: { slide: BannerSlide; active: boolean }) {
  const hasVideo = Boolean(slide.videoUrl);
  const hasImage = Boolean(slide.imageUrl) && !hasVideo;
  const hasMedia = hasVideo || hasImage;

  return (
    <div
      className="absolute inset-0 transition-opacity duration-700"
      style={{ opacity: active ? 1 : 0, zIndex: active ? 1 : 0 }}
    >
      {/* Base gradient always present */}
      <div className={cn('absolute inset-0 bg-gradient-to-br', slide.bgGradient)} />

      {/* Video background */}
      {hasVideo && (
        <>
          <video
            key={slide.videoUrl}
            src={slide.videoUrl}
            className="absolute inset-0 h-full w-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/25 to-transparent" />
        </>
      )}

      {/* Image background */}
      {hasImage && (
        <>
          <Image
            src={slide.imageUrl}
            alt={slide.headline}
            fill
            sizes="(max-width: 768px) 100vw, 900px"
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/30 to-transparent" />
        </>
      )}

      {/* Decorative (no media) */}
      {!hasMedia && (
        <>
          <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, rgba(255,255,255,0.12) 0%, transparent 50%)' }} />
          <div className="absolute -right-10 -top-10 h-40 w-40 animate-pulse rounded-full bg-white/10" />
          <div className="absolute -bottom-6 right-24 h-24 w-24 animate-pulse rounded-full bg-white/10" />
          <div className="absolute bottom-2 right-6 select-none text-5xl sm:text-6xl">{slideEmoji(slide.bgGradient)}</div>
        </>
      )}
    </div>
  );
}

export function HeroSlider() {
  const [slides, setSlides]       = useState<BannerSlide[]>(FALLBACK_SLIDES);
  const [current, setCurrent]     = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [direction, setDirection] = useState<'next' | 'prev'>('next');

  useEffect(() => {
    fetch('/api/banners')
      .then((r) => r.json())
      .then((data: { data: BannerSlide[] }) => {
        if (data.data?.length > 0) { setSlides(data.data); setCurrent(0); }
      })
      .catch(() => {});
  }, []);

  const next = useCallback(() => { setDirection('next'); setCurrent((c) => (c + 1) % slides.length); }, [slides.length]);
  const prev = useCallback(() => { setDirection('prev'); setCurrent((c) => (c - 1 + slides.length) % slides.length); }, [slides.length]);
  const goTo = useCallback((i: number) => { setDirection(i > current ? 'next' : 'prev'); setCurrent(i); }, [current]);

  useEffect(() => {
    if (!isPlaying) return;
    const t = setInterval(next, SLIDE_INTERVAL);
    return () => clearInterval(t);
  }, [isPlaying, next]);

  const slide  = slides[current] ?? FALLBACK_SLIDES[0]!;
  const accent = ctaAccent(slide.bgGradient);
  const hasMedia = Boolean(slide.videoUrl) || Boolean(slide.imageUrl);

  const textVariants = {
    enter:  (dir: string) => ({ x: dir === 'next' ? 40 : -40, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit:   (dir: string) => ({ x: dir === 'next' ? -40 : 40, opacity: 0 }),
  };

  return (
    <div className="relative overflow-hidden rounded-2xl" role="region" aria-label="Featured promotions">
      <div className="relative w-full" style={{ paddingBottom: '43.75%' }}>
        <div className="absolute inset-0">
          {slides.map((s, i) => (
            <SlideBackground key={s.id} slide={s} active={i === current} />
          ))}

          {/* Text overlay */}
          <div className="absolute inset-0 z-10 flex flex-col justify-center">
            <AnimatePresence custom={direction} mode="wait" initial={false}>
              <motion.div
                key={slide.id}
                custom={direction}
                variants={textVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ type: 'tween', duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
                className="px-5 py-4 sm:px-7"
                aria-live="polite"
              >
                <span className={cn('inline-block rounded-full px-3 py-1 text-xs font-bold', hasMedia ? 'bg-white/20 text-white backdrop-blur-sm' : accent)}>
                  {slide.title}
                </span>
                <h2 className="mt-2 text-xl font-black leading-tight text-white sm:text-2xl md:text-3xl" style={{ whiteSpace: 'pre-line', textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}>
                  {slide.headline || slide.title}
                </h2>
                {slide.subtitle && (
                  <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-white/90 sm:text-sm" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
                    {slide.subtitle}
                  </p>
                )}
                <div className="mt-3">
                  <Link
                    href={slide.ctaLink}
                    className={cn('inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold shadow-md transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white', hasMedia ? 'bg-white text-neutral-900' : accent)}
                  >
                    {slide.ctaText}
                  </Link>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Dots */}
          <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2">
            {slides.map((_, i) => (
              <button key={i} onClick={() => goTo(i)} aria-label={`Slide ${i + 1}`} aria-pressed={i === current}
                className={cn('rounded-full transition-all duration-300 focus-visible:outline-none', i === current ? 'h-2 w-6 bg-white' : 'h-2 w-2 bg-white/50 hover:bg-white/80')} />
            ))}
          </div>

          {/* Prev / Next */}
          <button onClick={prev} aria-label="Previous" className="absolute left-2 top-1/2 z-20 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-black/25 text-white backdrop-blur-sm hover:bg-black/45">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={next} aria-label="Next" className="absolute right-2 top-1/2 z-20 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-black/25 text-white backdrop-blur-sm hover:bg-black/45">
            <ChevronRight className="h-4 w-4" />
          </button>
          <button onClick={() => setIsPlaying(!isPlaying)} aria-label={isPlaying ? 'Pause' : 'Play'}
            className="absolute bottom-2 right-2 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-black/25 text-white backdrop-blur-sm hover:bg-black/50">
            {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          </button>
        </div>
      </div>
    </div>
  );
}
