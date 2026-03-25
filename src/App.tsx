import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Loader2, Image as ImageIcon, AlertCircle, ChevronRight, Key, ExternalLink, Download, FileImage, FileCode, RotateCcw, Info } from "lucide-react";
import { GoogleGenAI, Type } from "@google/genai";
import ImageTracer from "imagetracerjs";

// User-provided Gemini API key
const GEMINI_API_KEY = "AIzaSyDZHZGhRxJQfhYTKcV2W3oNoqHdp7gFmuw";

const FIXED_STYLE_PROMPT = "CHARACTER ANCHOR (MANDATORY): friendly healthcare illustration character with a rounded head shape, visible hair, balanced human proportions, soft facial features, simplified body structure, and a clean flat vector appearance suitable for healthcare educational graphics. CHARACTER STRUCTURE RULES: Every character must include a head, visible hair, two eyes, nose, mouth, two arms, two hands, and two legs, following natural simplified human proportions. GENDER HAIR RULE (STRICT): Female characters must have visible long hair extending beyond the head shape (straight, tied, or wavy); Male characters must have visible short hair close to the head. Hair must always be clearly visible. ILLUSTRATION STYLE RULES: Pure flat 2D vector healthcare illustration, flat filled color shapes only, no outlines, no line-art, no stroke drawing, no sketch style, no contour drawing. Visual appearance: healthcare infographic illustration style, soft pastel healthcare color palette, rounded friendly characters, minimal shading, white or very light background, minimal environment, clean vector shapes. TEXT SUPPRESSION RULE: Generated illustrations must contain absolutely no text, no words, no letters, no labels, no captions, no typography, no annotations, no medical text. Use visual symbols or icons instead of written text. COMPOSITION RULES: use one clear main character, clearly represent the healthcare situation, simple and readable, include subtle medical indicators (thermometer, redness, virus icons, cough lines, etc.).";
const STYLE_RESTRICTIONS = "realistic, photorealistic, 3D render, anime style, manga style, comic style, painterly style, textured illustration, outline drawing, line-art illustration, sketch drawing, contour line illustration, dramatic lighting, complex environments, dark backgrounds, images containing any text or lettering, bald heads, missing limbs, distorted anatomy, oversized heads, incomplete bodies";

const GeminiSparkle = ({ className = "", active = false }: { className?: string; active?: boolean }) => (
  <motion.svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <defs>
      <linearGradient id="gemini-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#22D3EE" /> {/* Cyan */}
        <stop offset="33%" stopColor="#60A5FA" /> {/* Soft Blue */}
        <stop offset="66%" stopColor="#C084FC" /> {/* Lavender */}
        <stop offset="100%" stopColor="#A855F7" /> {/* Pastel Purple */}
      </linearGradient>

      {/* Shimmer Gradient */}
      <linearGradient id="shimmer-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="white" stopOpacity="0" />
        <stop offset="50%" stopColor="white" stopOpacity="0.5" />
        <stop offset="100%" stopColor="white" stopOpacity="0" />
      </linearGradient>

      {/* Mask for the sparkle shape */}
      <mask id="sparkle-mask">
        <path
          d="M12 2C12 2 13 10 22 12C13 14 12 22 12 22C12 22 11 14 2 12C11 10 12 2 12 2Z"
          fill="white"
        />
      </mask>
    </defs>

    {/* Base Shape with Aurora Gradient */}
    <motion.path
      d="M12 2C12 2 13 10 22 12C13 14 12 22 12 22C12 22 11 14 2 12C11 10 12 2 12 2Z"
      fill="url(#gemini-gradient)"
      animate={{
        filter: active 
          ? ["brightness(1) saturate(1.1)", "brightness(1.3) saturate(1.3)", "brightness(1) saturate(1.1)"]
          : ["brightness(1) saturate(1)", "brightness(1.1) saturate(1.1)", "brightness(1) saturate(1)"],
      }}
      transition={{
        duration: 3,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    />

    {/* Shimmer Layer */}
    <motion.rect
      x="-100%"
      y="0"
      width="300%"
      height="100%"
      fill="url(#shimmer-gradient)"
      mask="url(#sparkle-mask)"
      animate={{
        x: ["-100%", "100%"],
      }}
      transition={{
        duration: active ? 2 : 3,
        repeat: Infinity,
        ease: "linear",
      }}
      style={{ 
        opacity: active ? 0.5 : 0.2,
        transition: "opacity 0.5s ease"
      }}
    />
  </motion.svg>
);

export default function App() {
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isButtonHovered, setIsButtonHovered] = useState(false);
  const [isButtonFocused, setIsButtonFocused] = useState(false);
  const [result, setResult] = useState<{
    imageUrl: string;
    scenePrompt: string;
    finalPrompt: string;
  } | null>(null);
  const [imageHistory, setImageHistory] = useState<string[]>([]);
  const [promptHistory, setPromptHistory] = useState<string[]>([]);
  const [isVectorizing, setIsVectorizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [userApiKey, setUserApiKey] = useState("");
  const [tempApiKey, setTempApiKey] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load API key from localStorage on mount
  useEffect(() => {
    const savedKey = localStorage.getItem("gemini_api_key");
    if (savedKey) {
      setUserApiKey(savedKey);
    }
  }, []);

  // Cooldown timer
  useEffect(() => {
    if (cooldownRemaining > 0) {
      const timer = setTimeout(() => setCooldownRemaining(prev => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldownRemaining]);

  const handleRegisterApiKey = () => {
    if (tempApiKey.trim()) {
      localStorage.setItem("gemini_api_key", tempApiKey.trim());
      setUserApiKey(tempApiKey.trim());
      setShowApiKeyModal(false);
    }
  };

  // Clean Gemini Integration - Single Trigger Point
  const handleGenerate = async () => {
    const normalizedPrompt = prompt.trim().toLowerCase();
    if (!normalizedPrompt || isLoading || cooldownRemaining > 0) return;

    // Check for API key
    if (!userApiKey) {
      setTempApiKey("");
      setShowApiKeyModal(true);
      return;
    }

    // 1. Duplicate Prompt Check (Cache)
    const cache = JSON.parse(localStorage.getItem("kb_kanvas_cache") || "{}");
    const cachedItem = cache[normalizedPrompt];
    const now = Date.now();
    
    if (cachedItem && (now - cachedItem.timestamp < 24 * 60 * 60 * 1000)) {
      setResult({
        imageUrl: cachedItem.imageUrl,
        scenePrompt: prompt,
        finalPrompt: cachedItem.finalPrompt,
      });
      setCooldownRemaining(30);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: userApiKey });
      const finalPrompt = `Healthcare situation: ${prompt}. ${FIXED_STYLE_PROMPT}. ${STYLE_RESTRICTIONS}`;

      // 10-second Timeout Implementation
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("TIMEOUT")), 10000)
      );

      const generationPromise = ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: [{ text: finalPrompt }],
        config: {
          imageConfig: { aspectRatio: "1:1" },
        },
      });

      // Race against timeout
      const response = await Promise.race([generationPromise, timeoutPromise]) as any;

      let imageUrl = null;
      const parts = response.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData) {
          imageUrl = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }

      if (!imageUrl) throw new Error("No image data returned");

      // Update Cache
      cache[normalizedPrompt] = { imageUrl, finalPrompt, timestamp: now };
      localStorage.setItem("kb_kanvas_cache", JSON.stringify(cache));

      // Update State
      setResult({ imageUrl, scenePrompt: prompt, finalPrompt });
      setImageHistory(prev => [imageUrl, ...prev].slice(0, 6));
      setPromptHistory(prev => {
        const filtered = prev.filter(p => p !== prompt);
        return [prompt, ...filtered].slice(0, 5);
      });

    } catch (err: any) {
      const msg = err.message || "";
      if (msg === "TIMEOUT") {
        setError("응답 시간이 초과되었습니다. 다시 시도해주세요.");
      } else if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota")) {
        setError("요청이 너무 많습니다. 잠시 후 다시 시도해주세요.");
      } else if (msg.includes("API_KEY_INVALID") || msg.includes("invalid") || msg.includes("403")) {
        setError("유효하지 않은 API 키입니다. 키를 다시 확인해주세요.");
        setUserApiKey("");
        localStorage.removeItem("gemini_api_key");
      } else {
        setError("이미지 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
      }
    } finally {
      setIsLoading(false);
      setCooldownRemaining(30);
    }
  };

  const downloadPNG = () => {
    if (!result) return;
    const link = document.createElement("a");
    link.href = result.imageUrl;
    link.download = `kb-kanvas-image-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadSVG = async () => {
    if (!result) return;
    
    setIsVectorizing(true);
    setError(null);
    
    try {
      // 1. Pre-processing: Load image into canvas for cleaning and smoothing
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = result.imageUrl;
      });

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("Canvas context failed");

      // Use a higher resolution for tracing to preserve detail
      const scale = 2; 
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      
      // Apply subtle filters to clean up AI artifacts before tracing
      ctx.filter = "contrast(1.05) saturate(1.05) blur(0.5px)";
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      
      const cleanedImageData = canvas.toDataURL("image/png");

      // 2. High-Fidelity Vectorization with ImageTracer
      // Optimized for smooth curves and accurate color representation
      const options = {
        ltres: 0.1,        // Error threshold for straight lines (lower = more accurate)
        qtres: 0.1,        // Error threshold for quadratic splines (lower = more accurate)
        pathomit: 8,       // Skip very small paths to reduce noise
        numberofcolors: 32, // High color depth for fidelity
        mincolorratio: 0.001,
        colorquantcycles: 5,
        colorsampling: 1,
        blurradius: 0.5,
        blurdelta: 10,
        strokewidth: 0,    // No outlines, pure flat shapes
        linefilter: true,
        scale: 1 / scale,  // Scale back to original size
        viewbox: true,
        desc: false,
      };

      const rawSvg = await new Promise<string>((resolve, reject) => {
        try {
          ImageTracer.imageToSVG(
            cleanedImageData,
            (svgString: string) => {
              if (svgString) resolve(svgString);
              else reject(new Error("Vectorization failed"));
            },
            options
          );
        } catch (err) {
          reject(err);
        }
      });

      // 3. Post-processing: Logical Grouping and Cleanup
      // We parse the SVG and group paths by color to simulate semantic layers
      const parser = new DOMParser();
      const svgDoc = parser.parseFromString(rawSvg, "image/svg+xml");
      const svgElement = svgDoc.querySelector("svg");
      
      if (!svgElement) throw new Error("Failed to parse generated SVG");

      // Remove any metadata or comments that might contain "xml" or labels
      const paths = Array.from(svgElement.querySelectorAll("path"));
      
      // Group paths by color
      const colorGroups: Record<string, SVGPathElement[]> = {};
      paths.forEach(path => {
        const fill = path.getAttribute("fill") || "none";
        if (!colorGroups[fill]) colorGroups[fill] = [];
        colorGroups[fill].push(path);
      });

      // Clear original paths
      while (svgElement.firstChild) {
        svgElement.removeChild(svgElement.firstChild);
      }

      // Re-add paths in logical groups
      // We try to guess the semantic group based on color brightness/saturation
      Object.entries(colorGroups).forEach(([color, groupPaths], index) => {
        const g = svgDoc.createElementNS("http://www.w3.org/2000/svg", "g");
        
        // Basic heuristic for naming groups
        let groupId = `group_${index}`;
        const hex = color.replace("#", "");
        const r = parseInt(hex.substring(0, 2), 16);
        const g_val = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        const brightness = (r * 299 + g_val * 587 + b * 114) / 1000;

        if (brightness > 240) groupId = "background_highlights";
        else if (brightness < 40) groupId = "hair_details";
        else if (r > 200 && g_val > 150 && b > 120) groupId = "face_skin";
        
        g.setAttribute("id", groupId);
        groupPaths.forEach(p => g.appendChild(p));
        svgElement.appendChild(g);
      });

      // Final SVG string cleanup
      let finalSvg = new XMLSerializer().serializeToString(svgDoc);
      
      // Ensure no text or raster content
      finalSvg = finalSvg.replace(/<image[^>]*>|<\?xml[^>]*>|<!--[\s\S]*?-->/gi, "");
      
      // Add standard headers
      const header = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n`;
      if (!finalSvg.startsWith("<?xml")) {
        finalSvg = header + finalSvg;
      }

      const blob = new Blob([finalSvg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `kb-kanvas-vector-${Date.now()}.svg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Vectorization error:", err);
      setError("고품질 벡터 변환 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setIsVectorizing(false);
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [prompt]);

  const examplePrompts = [
    "알레르기로 눈이 가려운 상황",
    "열이 나서 체온을 재는 여성",
    "두통으로 머리를 잡고 있는 사람",
    "의사에게 진찰을 받는 아이",
    "약국에서 약을 처방받는 상황"
  ];

  return (
    <div className="min-h-screen bg-white text-zinc-900 font-sans selection:bg-zinc-100 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-3xl flex flex-col items-center">
        {/* Title Section */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="text-center mb-16"
        >
          <h1 className="text-5xl font-bold tracking-tight mb-4 text-zinc-900">
            Got an idea, KB Kanvas
          </h1>
          <p className="text-zinc-500 text-lg font-medium">
            KB헬스케어의 스타일로 건강 상황에 맞는 그래픽 AI를 생성해보세요
          </p>
        </motion.div>

        {/* Prompt Box Wrapper - Unified Parent */}
        <div className="w-full max-w-2xl mx-auto mb-4 flex justify-between items-end px-2">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-400 bg-zinc-50 px-3 py-1 rounded-full border border-zinc-100">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            KB Kanvas Style Locked
          </div>
        </div>

        <div 
          className={`
            relative w-full max-w-2xl mx-auto transition-all duration-500 z-10
            ${isFocused ? 'scale-[1.01]' : 'hover:scale-[1.002]'}
          `}
        >
          {/* 1. Aurora Glow Layer (Absolute, anchored to parent) */}
          <div className="absolute -inset-10 pointer-events-none z-0">
            <div className={`
              absolute inset-0 bg-gradient-to-b from-transparent via-cyan-100/20 to-purple-100/30 blur-3xl rounded-[60px] 
              transition-opacity duration-700
              ${isFocused ? 'opacity-100' : 'opacity-60'}
            `} />
            <div className={`
              absolute inset-8 bg-gradient-to-r from-[#99F6E4]/20 via-[#A5F3FC]/20 via-[#E9D5FF]/20 via-[#FBCFE8]/20 to-[#FFEDD5]/20 blur-2xl rounded-[40px] 
              transition-opacity duration-700
              ${isFocused ? 'opacity-100' : 'opacity-50'}
            `} />
          </div>

          {/* 2. Gradient Border Layer (Absolute, anchored to parent) */}
          <div className={`
            absolute inset-0 z-10 rounded-[28px] overflow-hidden transition-all duration-500
            ${isFocused 
              ? 'shadow-[0_40px_80px_rgba(0,0,0,0.1),0_0_0_3px_rgba(111,216,194,0.25)]' 
              : 'shadow-[0_20px_50px_rgba(0,0,0,0.05)] hover:shadow-[0_25px_60px_rgba(0,0,0,0.07)]'}
          `}>
            {/* Iridescent Border Background */}
            <div className={`
              absolute inset-0 bg-gradient-to-r from-[#99F6E4] via-[#A5F3FC] via-[#E9D5FF] via-[#FBCFE8] via-[#FFEDD5] to-[#99F6E4] 
              transition-opacity duration-500
              ${isFocused ? 'opacity-100 saturate-[1.2]' : 'opacity-90'}
            `} />
            
            {/* Animated Highlight Sweep */}
            <div className="absolute inset-[-200%] bg-[conic-gradient(from_0deg,transparent_0%,transparent_45%,rgba(255,255,255,0.8)_50%,transparent_55%,transparent_100%)] animate-slow-spin opacity-40 pointer-events-none" />
          </div>

          {/* 3. Inner Content Box (Relative, defines the size, sits on top of border) */}
          <div 
            className="relative z-20 m-[1.5px] bg-white rounded-[26.5px] overflow-hidden min-h-[120px] flex flex-col"
            style={{ transform: 'translateZ(0)' }} // Force GPU acceleration for cleaner clipping
          >
            <div className="p-5 pb-16 flex-grow">
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder="증상이나 건강 상황을 한국어로 입력하세요 (예: 목이 붓고 아픈 상황)"
                className="w-full bg-transparent border-none outline-none focus:outline-none focus:ring-0 text-xl resize-none placeholder:text-zinc-300 min-h-[80px] leading-relaxed text-zinc-900 block overflow-y-auto"
                disabled={isLoading}
              />
            </div>

            {/* Action Button - Anchored to the same container */}
            <div className="absolute bottom-4 right-4 z-30">
              <button
                onClick={handleGenerate}
                onMouseEnter={() => setIsButtonHovered(true)}
                onMouseLeave={() => setIsButtonHovered(false)}
                onFocus={() => setIsButtonFocused(true)}
                onBlur={() => setIsButtonFocused(false)}
                disabled={isLoading || !prompt.trim() || cooldownRemaining > 0}
                className={`
                  flex items-center gap-2 px-6 py-3 rounded-full font-medium transition-all duration-300
                  ${isLoading || !prompt.trim() || cooldownRemaining > 0
                    ? "bg-zinc-100 text-zinc-400 cursor-not-allowed" 
                    : "bg-zinc-900 text-white hover:bg-zinc-800 hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-zinc-200"}
                `}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>생성 중...</span>
                  </>
                ) : cooldownRemaining > 0 ? (
                  <>
                    <RotateCcw className="w-4 h-4 animate-spin" />
                    <span>재시도 가능 ({cooldownRemaining}s)</span>
                  </>
                ) : (
                  <>
                    <GeminiSparkle 
                      className="w-5 h-5" 
                      active={isButtonHovered || isButtonFocused} 
                    />
                    <span>생성하기</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Example Prompts & History */}
        <div className="w-full max-w-2xl mx-auto mt-6 space-y-6">
          {!result && (
            <div className="space-y-3">
              <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider px-1">추천 상황</p>
              <div className="flex flex-wrap gap-2">
                {examplePrompts.map((ex, i) => (
                  <button
                    key={i}
                    onClick={() => setPrompt(ex)}
                    className="px-4 py-2 bg-zinc-50 border border-zinc-100 rounded-xl text-sm text-zinc-600 hover:bg-zinc-100 hover:border-zinc-200 transition-all active:scale-95"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {promptHistory.length > 0 && (
            <div className="space-y-3">
              <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider px-1">최근 입력</p>
              <div className="flex flex-wrap gap-2">
                {promptHistory.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => setPrompt(p)}
                    className="px-4 py-2 bg-white border border-zinc-200 rounded-xl text-sm text-zinc-500 hover:bg-zinc-50 transition-all active:scale-95"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Error Message */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="mt-6 flex items-center gap-2 text-red-500 bg-red-50 px-4 py-2 rounded-lg text-sm border border-red-100"
            >
              <AlertCircle className="w-4 h-4" />
              <span>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Result Section */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-12 w-full space-y-8"
            >
              <div className="aspect-square w-full max-w-2xl mx-auto rounded-[32px] overflow-hidden shadow-2xl shadow-zinc-200 border border-zinc-100 bg-zinc-50 flex items-center justify-center relative group">
                <motion.img
                  key={result.imageUrl}
                  initial={{ opacity: 0, scale: 1.05 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  src={result.imageUrl}
                  alt="Generated Brand Style Graphic"
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-300 pointer-events-none" />
              </div>

              {/* Image History Thumbnails */}
              {imageHistory.length > 1 && (
                <div className="w-full max-w-2xl mx-auto space-y-3">
                  <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider px-1">생성 기록</p>
                  <div className="grid grid-cols-6 gap-3">
                    {imageHistory.map((url, i) => (
                      <button
                        key={i}
                        onClick={() => setResult(prev => prev ? { ...prev, imageUrl: url } : null)}
                        className={`aspect-square rounded-xl overflow-hidden border-2 transition-all hover:scale-105 active:scale-95 flex items-center justify-center bg-white ${result.imageUrl === url ? 'border-zinc-900 shadow-md' : 'border-transparent opacity-60 hover:opacity-100'}`}
                      >
                        <img src={url} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Download & Action Buttons */}
              <div className="flex flex-col items-center gap-4">
                <div className="flex flex-wrap justify-center gap-3">
                  <button
                    onClick={downloadPNG}
                    className="flex items-center gap-2 px-6 py-3 bg-white border border-zinc-200 text-zinc-700 rounded-full font-medium hover:bg-zinc-50 hover:border-zinc-300 transition-all shadow-sm active:scale-95"
                  >
                    <FileImage className="w-4 h-4" />
                    <span>PNG 다운로드</span>
                  </button>
                  <button
                    onClick={downloadSVG}
                    disabled={isVectorizing}
                    className="flex items-center gap-2 px-6 py-3 bg-white border border-zinc-200 text-zinc-700 rounded-full font-medium hover:bg-zinc-50 hover:border-zinc-300 transition-all shadow-sm active:scale-95 disabled:opacity-70"
                  >
                    {isVectorizing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <FileCode className="w-4 h-4" />
                    )}
                    <span>{isVectorizing ? "고품질 벡터 변환 중..." : "SVG 다운로드"}</span>
                  </button>
                  <button
                    onClick={handleGenerate}
                    disabled={isLoading}
                    className="flex items-center gap-2 px-6 py-3 bg-zinc-900 text-white rounded-full font-medium hover:bg-zinc-800 transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RotateCcw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                    <span>다시 생성하기</span>
                  </button>
                </div>
                
                <div className="flex flex-col items-center gap-1 max-w-md text-center">
                  <div className="flex items-start gap-2">
                    <Info className="w-3.5 h-3.5 text-zinc-400 mt-0.5 shrink-0" />
                    <p className="text-[11px] text-zinc-400 leading-normal">
                      SVG 다운로드 시 이미지를 고품질 벡터 패스로 변환합니다. Adobe Illustrator에서 개별 개체 선택 및 수정이 가능한 전문가용 파일로 내보냅니다.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Empty State / Placeholder */}
        {!result && !isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-20 flex flex-col items-center text-zinc-300"
          >
            <div className="w-16 h-16 rounded-full bg-zinc-50 flex items-center justify-center mb-4">
              <ImageIcon className="w-6 h-6" />
            </div>
            <p className="text-sm font-medium">생성된 이미지가 여기에 표시됩니다</p>
          </motion.div>
        )}
      </div>

      {/* API Key Modal */}
      <AnimatePresence>
        {showApiKeyModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[32px] p-8 w-full max-w-md shadow-2xl border border-zinc-100"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-2xl bg-zinc-900 flex items-center justify-center">
                  <Key className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-zinc-900">API 키 설정</h2>
                  <p className="text-sm text-zinc-500">Gemini API 키를 입력해주세요</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider ml-1">Gemini API Key</label>
                  <input
                    type="password"
                    value={tempApiKey}
                    onChange={(e) => setTempApiKey(e.target.value)}
                    placeholder="AIzaSy..."
                    className="w-full px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-2xl outline-none focus:ring-2 focus:ring-zinc-900/5 transition-all"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setShowApiKeyModal(false)}
                    className="flex-1 px-6 py-3 bg-zinc-50 text-zinc-600 rounded-full font-medium hover:bg-zinc-100 transition-all active:scale-95"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleRegisterApiKey}
                    disabled={!tempApiKey.trim()}
                    className="flex-1 px-6 py-3 bg-zinc-900 text-white rounded-full font-medium hover:bg-zinc-800 transition-all active:scale-95 disabled:opacity-50"
                  >
                    등록하기
                  </button>
                </div>

                <a 
                  href="https://aistudio.google.com/app/apikey" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-600 transition-colors pt-2"
                >
                  <span>API 키 발급받기</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
