
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { GeminiService } from './services/geminiService';
import { VideoConfig, VideoMode, VisualStyle, PromptRow } from './types';

// Helper components
const Button: React.FC<{ 
  onClick?: () => void; 
  disabled?: boolean; 
  className?: string; 
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'outline' | 'ghost' | 'info' | 'gemini' | 'neon-yellow';
  children: React.ReactNode;
}> = ({ onClick, disabled, className = '', loading, variant = 'primary', children }) => {
  const gradientStyles: Record<string, string> = {
    primary: "from-emerald-700 via-green-600 to-teal-700",
    gemini: "from-emerald-600 via-green-600 to-teal-600",
    success: "from-emerald-600 via-green-600 to-teal-700",
    info: "from-teal-600 via-emerald-600 to-green-700",
    'neon-yellow': "from-emerald-700 via-green-600 to-lime-600",
    outline: "from-emerald-800 via-green-700 to-teal-800",
    secondary: "from-slate-800 to-slate-950",
    danger: "from-rose-600 via-red-600 to-pink-700",
    ghost: "from-emerald-700 to-teal-800"
  };

  const frameStyles: Record<string, string> = {
    primary: "bg-slate-200/90 border-slate-300 shadow-[inset_3px_3px_6px_rgba(15,23,42,0.22),inset_-3px_-3px_6px_rgba(255,255,255,1)]",
    gemini: "bg-emerald-100/90 border-emerald-300 shadow-[inset_3px_3px_6px_rgba(5,150,105,0.24),inset_-3px_-3px_6px_rgba(255,255,255,1)]",
    success: "bg-emerald-100/90 border-emerald-300 shadow-[inset_3px_3px_6px_rgba(5,150,105,0.24),inset_-3px_-3px_6px_rgba(255,255,255,1)]",
    info: "bg-teal-100/90 border-teal-300 shadow-[inset_3px_3px_6px_rgba(13,148,136,0.24),inset_-3px_-3px_6px_rgba(255,255,255,1)]",
    'neon-yellow': "bg-lime-100/90 border-lime-300 shadow-[inset_3px_3px_6px_rgba(101,163,13,0.24),inset_-3px_-3px_6px_rgba(255,255,255,1)]",
    outline: "bg-slate-200/90 border-slate-300 shadow-[inset_3px_3px_6px_rgba(15,23,42,0.22),inset_-3px_-3px_6px_rgba(255,255,255,1)]",
    secondary: "bg-slate-200 border-slate-300 shadow-[inset_3px_3px_6px_rgba(15,23,42,0.22),inset_-3px_-3px_6px_rgba(255,255,255,1)]",
    danger: "bg-rose-100/90 border-rose-300 shadow-[inset_3px_3px_6px_rgba(225,29,72,0.24),inset_-3px_-3px_6px_rgba(255,255,255,1)]",
    ghost: "bg-transparent border-transparent shadow-none"
  };

  return (
    <div className={`inline-flex p-1.5 rounded-2xl border ${frameStyles[variant] || frameStyles.primary} transition-all duration-200 ${disabled || loading ? 'opacity-50 cursor-not-allowed' : 'hover:scale-[1.01] active:scale-[0.98]'}`}>
      <button 
        type="button"
        onClick={onClick} 
        disabled={disabled || loading} 
        className={`px-5 py-2.5 rounded-xl font-black text-sm transition-all duration-200 flex items-center justify-center gap-2 bg-gradient-to-b from-white via-white to-slate-50 shadow-[4px_6px_14px_rgba(15,23,42,0.16),-3px_-3px_8px_rgba(255,255,255,1)] border border-slate-200/90 hover:shadow-[5px_8px_18px_rgba(16,185,129,0.25)] hover:border-emerald-300 active:shadow-[inset_3px_3px_6px_rgba(15,23,42,0.24),inset_-2px_-2px_4px_rgba(255,255,255,0.95)] active:translate-y-0.5 cursor-pointer disabled:cursor-not-allowed ${className}`}
      >
        {loading ? (
          <i className="fas fa-spinner fa-spin text-emerald-600"></i>
        ) : (
          <span className={`bg-gradient-to-r ${gradientStyles[variant] || gradientStyles.primary} bg-clip-text text-transparent flex items-center gap-2 drop-shadow-[0_1px_1px_rgba(0,0,0,0.08)]`}>
            {children}
          </span>
        )}
      </button>
    </div>
  );
};

const Card: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className = '' }) => (
  <div className={`bg-white border-2 border-slate-200/90 rounded-2xl p-6 sm:p-7 shadow-[4px_6px_20px_rgba(15,23,42,0.06),-3px_-3px_10px_rgba(255,255,255,1)] ${className}`}>
    <div className="flex items-center gap-3 mb-6">
      <div className="w-2 h-7 bg-gradient-to-b from-emerald-500 via-green-500 to-teal-600 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.4)]"></div>
      <h3 className="text-base sm:text-lg font-black bg-gradient-to-r from-emerald-800 via-green-700 to-teal-800 bg-clip-text text-transparent uppercase tracking-tight drop-shadow-xs">
        {title}
      </h3>
    </div>
    {children}
  </div>
);

const StepIndicator: React.FC<{ currentStep: number }> = ({ currentStep }) => {
  const steps = ["Hệ thống", "Nội dung", "Cấu hình", "Dàn ý", "Hoàn tất"];
  return (
    <div className="flex items-center justify-between mb-12 max-w-4xl mx-auto px-4">
      {steps.map((step, idx) => (
        <React.Fragment key={idx}>
          <div className="flex flex-col items-center relative z-10">
            {/* Khung chìm ngoài siêu rõ nét */}
            <div className={`p-2 rounded-full transition-all duration-500 border ${
              idx <= currentStep 
                ? "bg-emerald-100/90 shadow-[inset_3px_3px_7px_rgba(5,150,105,0.28),inset_-3px_-3px_6px_rgba(255,255,255,1)] border-emerald-300" 
                : "bg-slate-200 shadow-[inset_3px_3px_6px_rgba(15,23,42,0.22),inset_-3px_-3px_6px_rgba(255,255,255,1)] border-slate-300"
            }`}>
              {/* Nốt nổi trong 3D siêu rõ nét */}
              <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black transition-all duration-500 ${
                idx <= currentStep 
                  ? "bg-gradient-to-b from-white to-slate-50 shadow-[5px_7px_16px_rgba(5,150,105,0.3),-3px_-3px_8px_rgba(255,255,255,1)] border-2 border-emerald-600 scale-110" 
                  : "bg-gradient-to-b from-white to-slate-100 shadow-[3px_4px_8px_rgba(15,23,42,0.14),-2px_-2px_5px_rgba(255,255,255,1)] border border-slate-300"
              }`}>
                <span className={`text-base font-black ${
                  idx <= currentStep 
                    ? "bg-gradient-to-r from-emerald-700 via-green-600 to-teal-700 bg-clip-text text-transparent drop-shadow-sm" 
                    : "text-slate-400"
                }`}>
                  {idx < currentStep ? <i className="fas fa-check text-sm text-emerald-600"></i> : idx + 1}
                </span>
              </div>
            </div>
            {/* Chữ trên nốt màu gradient xanh lá */}
            <span className={`text-xs uppercase tracking-wider mt-3 font-black ${
              idx <= currentStep 
                ? "bg-gradient-to-r from-emerald-700 via-green-600 to-teal-700 bg-clip-text text-transparent drop-shadow-xs" 
                : "text-slate-400"
            }`}>
              {step}
            </span>
          </div>
          {idx < steps.length - 1 && (
            <div className="flex-1 h-3 mx-2 -mt-7 bg-slate-200 rounded-full shadow-[inset_2px_2px_4px_rgba(15,23,42,0.22),inset_-2px_-2px_4px_rgba(255,255,255,1)] border border-slate-300/80 overflow-hidden">
              <div 
                className={`h-full transition-all duration-700 rounded-full ${
                  idx < currentStep 
                    ? "bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 w-full shadow-[0_1px_4px_rgba(5,150,105,0.5)]" 
                    : "w-0"
                }`}
              ></div>
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

export default function App() {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSystemReady, setIsSystemReady] = useState(false);
  
  const [avatarUrl, setAvatarUrl] = useState<string>(() => {
    return localStorage.getItem('huynh_hong_avatar') || '/huynh-hong-avatar.svg';
  });

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        if (result) {
          setAvatarUrl(result);
          try {
            localStorage.setItem('huynh_hong_avatar', result);
          } catch (err) {
            console.warn('Cannot persist avatar to localStorage:', err);
          }
        }
      };
      reader.readAsDataURL(file);
    }
  };
  
  const [config, setConfig] = useState<VideoConfig>({
    summary: '',
    styleAnalysis: '',
    mode: VideoMode.Different,
    topic: '',
    visualStyle: VisualStyle.Cinematic,
    aspectRatio: '16:9',
    durationMin: 1,
    voiceLang: 'Tiếng Việt',
    channelName: '',
    background: '',
    timeline: '',
    prompts: []
  });

  const languages = [
    'Tiếng Việt', 'Tiếng Anh', 'Tiếng Trung', 'Tiếng Nhật', 'Tiếng Hàn', 
    'Tiếng Pháp', 'Tiếng Đức', 'Tiếng Tây Ban Nha', 'Tiếng Nga'
  ];

  const gemini = useMemo(() => new GeminiService(), []);

  useEffect(() => {
    if (step === 0) {
      const init = async () => {
        setLoading(true);
        try {
          await gemini.verifyKey();
          setIsSystemReady(true);
          setTimeout(() => setStep(1), 500);
        } catch (err: any) {
          setError(err.message === 'QUOTA_EXHAUSTED' ? "Hệ thống quá tải. Thử lại sau." : "Lỗi API.");
        } finally {
          setLoading(false);
        }
      };
      init();
    }
  }, [step, gemini]);

  const handleApiError = useCallback((err: any) => {
    if (err.message?.includes('429') || err.message?.includes('RESOURCE_EXHAUSTED')) {
      setError("Cảnh báo: Hết Quota API!");
    } else {
      setError(err.message || "Đã xảy ra lỗi.");
    }
  }, []);

  const handleNextFromStep1 = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await gemini.generateInitialSetup(config.summary, config.styleAnalysis, config.mode, config.visualStyle);
      setConfig(prev => ({ ...prev, topic: result.topic, background: result.background }));
      setStep(2);
    } catch (err) {
      handleApiError(err);
      setStep(2); 
    } finally {
      setLoading(false);
    }
  };

  const regenerateTopic = async () => {
    setLoading(true);
    try {
      const topic = await gemini.generateTopic(config.summary, config.styleAnalysis, config.mode);
      const bg = await gemini.generateBackground(topic, config.visualStyle, config.styleAnalysis);
      setConfig(prev => ({ ...prev, topic, background: bg }));
    } catch (err) { handleApiError(err); }
    finally { setLoading(false); }
  };

  const regenerateBackground = async () => {
    setLoading(true);
    try {
      const bg = await gemini.generateBackground(config.topic, config.visualStyle, config.styleAnalysis);
      setConfig(prev => ({ ...prev, background: bg }));
    } catch (err) { handleApiError(err); }
    finally { setLoading(false); }
  };

  const handleGenerateTimelineFromStep2 = async () => {
    setLoading(true);
    setError(null);
    try {
      const durationSecActual = Math.ceil(config.durationMin * 60 / 8) * 8;
      const tl = await gemini.generateTimeline(config.topic, config.background, durationSecActual, config.styleAnalysis);
      setConfig(prev => ({ ...prev, timeline: tl }));
      setStep(3);
    } catch (err) {
      handleApiError(err);
      setStep(3);
    } finally {
      setLoading(false);
    }
  };

  const generateTimelineAgain = async () => {
    setLoading(true);
    try {
      const durationSecActual = Math.ceil(config.durationMin * 60 / 8) * 8;
      const tl = await gemini.generateTimeline(config.topic, config.background, durationSecActual, config.styleAnalysis);
      setConfig(prev => ({ ...prev, timeline: tl }));
    } catch (err) { handleApiError(err); }
    finally { setLoading(false); }
  };

  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(id);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const copyAllPrompts = () => {
    const text = config.prompts.map(p => p.prompt).join('\n\n');
    copyToClipboard(text, 'all-prompts');
  };

  const copyAllVoices = () => {
    const text = config.prompts.map(p => p.voice).join('\n');
    copyToClipboard(text, 'all-voices');
  };

  const generatePrompts = async () => {
    setLoading(true);
    try {
      const durationSecActual = Math.ceil(config.durationMin * 60 / 8) * 8;
      const numSegments = Math.ceil(config.durationMin * 60 / 8);
      const prompts = await gemini.generatePrompts(
        config.timeline, 
        config.background, 
        config.visualStyle, 
        config.aspectRatio, 
        numSegments, 
        config.voiceLang,
        config.styleAnalysis
      );
      setConfig(prev => ({ ...prev, prompts }));
      setStep(4);
    } catch (err) { handleApiError(err); }
    finally { setLoading(false); }
  };

  const downloadPrompts = () => {
    const text = config.prompts.map(p => p.prompt).join('\n\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Prompts_${config.topic.replace(/\s+/g, '_')}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadVoices = () => {
    const text = config.prompts.map(p => p.voice).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Voices_${config.topic.replace(/\s+/g, '_')}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const durationSecActual = Math.ceil(config.durationMin * 60 / 8) * 8;
  const numSegments = Math.ceil(config.durationMin * 60 / 8);

  return (
    <div className="min-h-screen pb-20 bg-[#f8fafc] text-slate-800 font-['Plus_Jakarta_Sans',sans-serif]">
      <header className="bg-white/90 backdrop-blur-md border-b border-slate-200/90 py-4 px-6 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative group">
              <div className="w-12 h-12 rounded-full overflow-hidden shadow-md border-2 border-emerald-500 bg-white ring-2 ring-emerald-500/20 flex items-center justify-center">
                <img 
                  src={avatarUrl} 
                  alt="Huynh Hong Avatar"
                  className="w-full h-full object-cover"
                  onError={() => {
                    if (avatarUrl !== "/huynh-hong-avatar.svg") {
                      setAvatarUrl("/huynh-hong-avatar.svg");
                    }
                  }}
                />
              </div>
              <label 
                title="Thay đổi ảnh đại diện Huỳnh Hồng" 
                className="absolute inset-0 rounded-full bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity text-white text-xs"
              >
                <i className="fas fa-camera"></i>
                <input 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  onChange={handleAvatarUpload}
                />
              </label>
            </div>
            <div>
              <h1 className="text-lg sm:text-2xl font-black tracking-tight uppercase bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 bg-clip-text text-transparent drop-shadow-sm">
                VIDEO AI BÁN CONTENT - HUYNH HONG
              </h1>
            </div>
          </div>
          {isSystemReady && (
            <div className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200/80 flex items-center gap-2 shadow-sm">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
              SYSTEM ACTIVE
            </div>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto mt-8 px-4">
        {/* StepIndicator đã được ẩn hoàn toàn theo hình ảnh người dùng yêu cầu */}

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 px-5 py-3.5 rounded-2xl mb-8 flex items-center gap-3 shadow-sm">
            <i className="fas fa-exclamation-triangle text-rose-500"></i>
            <span className="text-sm font-semibold">{error}</span>
          </div>
        )}

        {/* STEP 1: INPUT */}
        {step === 1 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-top-4 duration-500">
            {/* Guide Section */}
            <div className="bg-gradient-to-r from-emerald-50/90 via-teal-50/60 to-green-50/80 border border-emerald-200/80 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex gap-4 items-start">
                <div className="mt-1 flex-shrink-0">
                   <div className="w-6 h-6 rounded-full border border-emerald-400/80 bg-white shadow-xs flex items-center justify-center text-emerald-600 text-xs font-bold">i</div>
                </div>
                <div className="space-y-2 text-sm leading-relaxed">
                  <p className="text-slate-700 font-medium">
                    Cách lấy thông tin video: copy đường link video rồi đưa vào Gemini kết hợp với câu lệnh <span className="italic font-bold text-emerald-900">"Phân tích cho tôi Nội dung và phong cách video trên"</span>.
                  </p>
                  <p className="text-amber-800 font-bold bg-amber-50/80 border border-amber-200/60 p-2.5 rounded-xl text-xs">
                    Ví dụ: https://www.youtube.com/watch?v=... Phân tích cho tôi Nội dung và phong cách video trên
                  </p>
                </div>
              </div>
              <div className="flex justify-center pt-2">
                <a href="https://gemini.google.com/" target="_blank" rel="noopener noreferrer">
                  <Button variant="gemini">
                    Gemini AI <i className="fas fa-external-link-alt ml-2 text-xs"></i>
                  </Button>
                </a>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              <Card title="Tóm tắt nội dung gốc">
                <div className="p-1.5 rounded-2xl bg-slate-200 border-2 border-slate-300 shadow-[inset_2.5px_3px_6px_rgba(15,23,42,0.18),inset_-2.5px_-3px_6px_rgba(255,255,255,1)]">
                  <textarea 
                    className="w-full bg-white border border-slate-200 rounded-xl p-4 h-64 outline-none focus:border-emerald-500 text-slate-800 font-medium placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-100 transition-all resize-none custom-scrollbar shadow-inner"
                    placeholder="Dán nội dung video gốc vào đây (cốt truyện, nhân vật, sự kiện cũ)..."
                    value={config.summary}
                    onChange={(e) => setConfig(prev => ({ ...prev, summary: e.target.value }))}
                  />
                </div>
              </Card>
              <Card title="Phân tích phong cách gốc (Sẽ giữ nguyên)">
                <div className="p-1.5 rounded-2xl bg-slate-200 border-2 border-slate-300 shadow-[inset_2.5px_3px_6px_rgba(15,23,42,0.18),inset_-2.5px_-3px_6px_rgba(255,255,255,1)]">
                  <textarea 
                    className="w-full bg-white border border-slate-200 rounded-xl p-4 h-64 outline-none focus:border-emerald-500 text-slate-800 font-medium placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-100 transition-all resize-none custom-scrollbar shadow-inner"
                    placeholder="Nhịp điệu dồn dập hay lắng đọng, gam màu điện ảnh/cyberpunk, âm thanh hào hùng/bí ẩn, góc quay cận cảnh/drone, văn phong giọng đọc..."
                    value={config.styleAnalysis}
                    onChange={(e) => setConfig(prev => ({ ...prev, styleAnalysis: e.target.value }))}
                  />
                </div>
              </Card>
            </div>
            
            {/* Mode selection */}
            <div className="p-3 rounded-3xl bg-slate-200 border-2 border-slate-300 shadow-[inset_3px_3px_7px_rgba(15,23,42,0.2),inset_-3px_-3px_7px_rgba(255,255,255,1)]">
              <label className="text-[11px] font-black text-slate-600 uppercase tracking-widest block mb-3 px-2">
                Lựa chọn phương thức sáng tạo nội dung mới (Đều giữ nguyên phong cách gốc)
              </label>
              <div className="grid md:grid-cols-2 gap-4">
                <div className={`p-2 rounded-2xl transition-all border-2 ${config.mode === VideoMode.Different ? 'bg-emerald-100/90 border-emerald-400 shadow-[inset_3px_3px_6px_rgba(5,150,105,0.26),inset_-3px_-3px_6px_rgba(255,255,255,1)]' : 'bg-slate-200/90 border-slate-300 shadow-[inset_2.5px_2.5px_5px_rgba(15,23,42,0.18),inset_-2.5px_-2.5px_5px_rgba(255,255,255,1)]'}`}>
                  <button
                    type="button"
                    onClick={() => setConfig(prev => ({ ...prev, mode: VideoMode.Different }))}
                    className={`w-full p-4 rounded-xl text-left transition-all ${
                      config.mode === VideoMode.Different
                        ? 'bg-gradient-to-b from-white to-slate-50 shadow-[4px_6px_14px_rgba(5,150,105,0.25),-2px_-2px_6px_rgba(255,255,255,1)] border-2 border-emerald-600 scale-[1.01]'
                        : 'bg-white shadow-[2px_3px_8px_rgba(15,23,42,0.1),-2px_-2px_5px_rgba(255,255,255,1)] text-slate-600 hover:bg-slate-50 border border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <div className={`w-3.5 h-3.5 rounded-full ${config.mode === VideoMode.Different ? 'bg-emerald-600 ring-4 ring-emerald-200 animate-pulse' : 'bg-slate-300'}`}></div>
                      <span className={`font-black text-sm ${config.mode === VideoMode.Different ? 'bg-gradient-to-r from-emerald-700 via-green-600 to-teal-700 bg-clip-text text-transparent drop-shadow-xs' : 'text-slate-700'}`}>
                        Đổi Mới Nội Dung Hoàn Toàn (Khuyên dùng)
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 pl-6 leading-relaxed font-medium">
                      Tạo chủ đề & cốt truyện mới 100% để tránh trùng lặp/bản quyền, kế thừa 100% phong cách nghệ thuật gốc.
                    </p>
                  </button>
                </div>

                <div className={`p-2 rounded-2xl transition-all border-2 ${config.mode === VideoMode.Similar ? 'bg-emerald-100/90 border-emerald-400 shadow-[inset_3px_3px_6px_rgba(5,150,105,0.26),inset_-3px_-3px_6px_rgba(255,255,255,1)]' : 'bg-slate-200/90 border-slate-300 shadow-[inset_2.5px_2.5px_5px_rgba(15,23,42,0.18),inset_-2.5px_-2.5px_5px_rgba(255,255,255,1)]'}`}>
                  <button
                    type="button"
                    onClick={() => setConfig(prev => ({ ...prev, mode: VideoMode.Similar }))}
                    className={`w-full p-4 rounded-xl text-left transition-all ${
                      config.mode === VideoMode.Similar
                        ? 'bg-gradient-to-b from-white to-slate-50 shadow-[4px_6px_14px_rgba(5,150,105,0.25),-2px_-2px_6px_rgba(255,255,255,1)] border-2 border-emerald-600 scale-[1.01]'
                        : 'bg-white shadow-[2px_3px_8px_rgba(15,23,42,0.1),-2px_-2px_5px_rgba(255,255,255,1)] text-slate-600 hover:bg-slate-50 border border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <div className={`w-3.5 h-3.5 rounded-full ${config.mode === VideoMode.Similar ? 'bg-emerald-600 ring-4 ring-emerald-200 animate-pulse' : 'bg-slate-300'}`}></div>
                      <span className={`font-black text-sm ${config.mode === VideoMode.Similar ? 'bg-gradient-to-r from-emerald-700 via-green-600 to-teal-700 bg-clip-text text-transparent drop-shadow-xs' : 'text-slate-700'}`}>
                        Nội Dung Tương Tự Nâng Cao
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 pl-6 leading-relaxed font-medium">
                      Cùng trục chủ đề nhưng viết mới toàn bộ kịch bản, khai thác góc nhìn sâu sắc hơn, giữ trọn phong cách gốc.
                    </p>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleNextFromStep1} disabled={!config.summary || !config.styleAnalysis || loading} loading={loading} className="w-64 shadow-md">
                Phân tích & Tiếp tục <i className="fas fa-arrow-right ml-2 text-xs"></i>
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: CONFIG */}
        {step === 2 && (
          <div className="space-y-8 animate-in slide-in-from-right-10 duration-500">
            {/* Style reminder chip */}
            <div className="p-2 rounded-2xl bg-slate-200/90 border-2 border-slate-300 shadow-[inset_2.5px_2.5px_5px_rgba(15,23,42,0.16),inset_-2.5px_-2.5px_5px_rgba(255,255,255,1)]">
              <div className="bg-white px-5 py-3 rounded-xl flex items-center justify-between shadow-[2px_3px_8px_rgba(15,23,42,0.08),-2px_-2px_5px_rgba(255,255,255,1)] border border-slate-200">
                <div className="flex items-center gap-2.5 text-xs text-slate-800">
                  <i className="fas fa-palette text-indigo-600 text-sm"></i>
                  <span className="font-extrabold">Phong cách gốc đang áp dụng:</span>
                  <span className="text-emerald-700 font-semibold italic truncate max-w-lg">"{config.styleAnalysis}"</span>
                </div>
                <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-300 px-3 py-1 rounded-lg font-black uppercase shadow-xs">
                  {config.mode === VideoMode.Different ? 'Đổi mới Content 100%' : 'Tương tự nâng cao'}
                </span>
              </div>
            </div>

            <Card title="Chủ đề & Bối cảnh (AI Tự động - Đổi mới nội dung theo phong cách)">
              <div className="space-y-8">
                <div>
                  <div className="flex justify-between items-center mb-3 px-1">
                    <label className="text-[11px] font-black text-slate-600 uppercase tracking-widest">Chủ đề mới muốn làm</label>
                    <Button variant="outline" onClick={regenerateTopic} loading={loading} className="py-1 px-4 text-[10px] rounded-lg h-8">
                      <i className="fas fa-wand-sparkles mr-1"></i> AI Tạo chủ đề khác
                    </Button>
                  </div>
                  <div className="p-1 rounded-2xl bg-slate-200 border-2 border-slate-300 shadow-[inset_2.5px_3px_6px_rgba(15,23,42,0.18),inset_-2.5px_-3px_6px_rgba(255,255,255,1)]">
                    <textarea 
                      className="w-full bg-white border border-slate-200 rounded-xl p-4 h-24 outline-none focus:border-emerald-500 text-slate-800 font-bold resize-none custom-scrollbar shadow-inner focus:ring-2 focus:ring-emerald-100 transition-all"
                      value={config.topic}
                      onChange={(e) => setConfig(prev => ({ ...prev, topic: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-3 px-1">
                    <label className="text-[11px] font-black text-slate-600 uppercase tracking-widest">Bối cảnh / Nền tảng (Kế thừa phong cách nghệ thuật)</label>
                    <Button variant="outline" onClick={regenerateBackground} loading={loading} className="py-1 px-4 text-[10px] rounded-lg h-8">
                      <i className="fas fa-sync mr-1"></i> Tạo lại bối cảnh
                    </Button>
                  </div>
                  <div className="p-1 rounded-2xl bg-slate-200 border-2 border-slate-300 shadow-[inset_2.5px_3px_6px_rgba(15,23,42,0.18),inset_-2.5px_-3px_6px_rgba(255,255,255,1)]">
                    <textarea 
                      className="w-full bg-white border border-slate-200 rounded-xl p-4 h-28 outline-none focus:border-emerald-500 text-slate-700 font-medium resize-none custom-scrollbar shadow-inner focus:ring-2 focus:ring-emerald-100 transition-all"
                      value={config.background}
                      onChange={(e) => setConfig(prev => ({ ...prev, background: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
            </Card>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-8">
                <Card title="Phong cách thị giác">
                  <div className="grid grid-cols-2 gap-3">
                    {Object.values(VisualStyle).map(v => (
                      <div key={v} className={`p-1.5 rounded-2xl border-2 transition-all ${config.visualStyle === v ? "bg-emerald-100/90 border-emerald-400 shadow-[inset_3px_3px_6px_rgba(5,150,105,0.26),inset_-3px_-3px_6px_rgba(255,255,255,1)]" : "bg-slate-200/90 border-slate-300 shadow-[inset_2.5px_2.5px_5px_rgba(15,23,42,0.18),inset_-2.5px_-2.5px_5px_rgba(255,255,255,1)]"}`}>
                        <button 
                          type="button"
                          onClick={() => setConfig(prev => ({ ...prev, visualStyle: v }))} 
                          className={`w-full py-3 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center justify-center ${config.visualStyle === v ? "bg-gradient-to-b from-white to-slate-50 shadow-[4px_6px_14px_rgba(5,150,105,0.26),-2px_-2px_6px_rgba(255,255,255,1)] border-2 border-emerald-600 scale-[1.02]" : "bg-white shadow-[2px_3px_8px_rgba(15,23,42,0.1),-2px_-2px_5px_rgba(255,255,255,1)] border border-slate-200 text-slate-500 hover:text-slate-800"}`}
                        >
                          <span className={config.visualStyle === v ? "bg-gradient-to-r from-emerald-700 via-green-600 to-teal-700 bg-clip-text text-transparent font-black drop-shadow-xs" : "text-slate-600 font-extrabold"}>
                            {v}
                          </span>
                        </button>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card title="Ngôn ngữ Voice">
                  <div className="grid grid-cols-3 gap-2.5">
                    {languages.map(lang => (
                      <div key={lang} className={`p-1 rounded-xl border-2 transition-all ${config.voiceLang === lang ? "bg-emerald-100/90 border-emerald-400 shadow-[inset_2.5px_2.5px_5px_rgba(5,150,105,0.26),inset_-2px_-2px_4px_rgba(255,255,255,1)]" : "bg-slate-200/90 border-slate-300 shadow-[inset_2px_2px_4px_rgba(15,23,42,0.18),inset_-2px_-2px_4px_rgba(255,255,255,1)]"}`}>
                        <button 
                          type="button"
                          onClick={() => setConfig(prev => ({ ...prev, voiceLang: lang }))} 
                          className={`w-full py-2 px-1 rounded-lg text-[10px] font-black transition-all flex items-center justify-center ${config.voiceLang === lang ? "bg-white border-2 border-emerald-600 shadow-[3px_4px_10px_rgba(5,150,105,0.24),-2px_-2px_5px_rgba(255,255,255,1)] scale-105" : "bg-white border border-slate-200 text-slate-500 hover:text-slate-800 shadow-[1px_2px_4px_rgba(15,23,42,0.06)]"}`}
                        >
                          <span className={config.voiceLang === lang ? "bg-gradient-to-r from-emerald-700 to-teal-700 bg-clip-text text-transparent font-black" : "text-slate-600 font-bold"}>
                            {lang}
                          </span>
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-[10px] text-slate-500 font-bold italic text-center">
                    * Giữ nguyên ngữ điệu & cảm xúc của video gốc, tối ưu độ dài chuẩn 8 giây mỗi phân cảnh.
                  </p>
                </Card>
              </div>

              <Card title="Kỹ thuật video">
                 <div className="space-y-10 h-full flex flex-col justify-center">
                   <div>
                     <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-3 block">Tỷ lệ khung hình</label>
                     <div className="flex gap-4">
                       <div className={`flex-1 p-2 rounded-2xl border-2 ${config.aspectRatio === '16:9' ? 'bg-emerald-100/90 border-emerald-400 shadow-[inset_3px_3px_6px_rgba(5,150,105,0.26),inset_-3px_-3px_6px_rgba(255,255,255,1)]' : 'bg-slate-200/90 border-slate-300 shadow-[inset_3px_3px_6px_rgba(15,23,42,0.18),inset_-3px_-3px_6px_rgba(255,255,255,1)]'}`}>
                         <button 
                           type="button"
                           onClick={() => setConfig(prev => ({ ...prev, aspectRatio: '16:9' }))} 
                           className={`w-full py-4 rounded-xl font-black transition-all flex flex-col items-center gap-1.5 ${config.aspectRatio === '16:9' ? "bg-gradient-to-b from-white to-slate-50 shadow-[5px_7px_16px_rgba(5,150,105,0.26),-3px_-3px_7px_rgba(255,255,255,1)] border-2 border-emerald-600 scale-[1.02]" : "bg-white shadow-[3px_4px_10px_rgba(15,23,42,0.1),-2px_-2px_5px_rgba(255,255,255,1)] border border-slate-200 text-slate-500 hover:text-slate-800"}`}
                         >
                           <i className={`fas fa-desktop text-lg ${config.aspectRatio === '16:9' ? 'text-emerald-600' : 'text-slate-400'}`}></i>
                           <span className={config.aspectRatio === '16:9' ? 'bg-gradient-to-r from-emerald-700 via-green-600 to-teal-600 bg-clip-text text-transparent drop-shadow-xs' : 'text-slate-600 font-bold'}>
                             16:9 (Ngang)
                           </span>
                         </button>
                       </div>
                       <div className={`flex-1 p-2 rounded-2xl border-2 ${config.aspectRatio === '9:16' ? 'bg-emerald-100/90 border-emerald-400 shadow-[inset_3px_3px_6px_rgba(5,150,105,0.26),inset_-3px_-3px_6px_rgba(255,255,255,1)]' : 'bg-slate-200/90 border-slate-300 shadow-[inset_3px_3px_6px_rgba(15,23,42,0.18),inset_-3px_-3px_6px_rgba(255,255,255,1)]'}`}>
                         <button 
                           type="button"
                           onClick={() => setConfig(prev => ({ ...prev, aspectRatio: '9:16' }))} 
                           className={`w-full py-4 rounded-xl font-black transition-all flex flex-col items-center gap-1.5 ${config.aspectRatio === '9:16' ? "bg-gradient-to-b from-white to-slate-50 shadow-[5px_7px_16px_rgba(5,150,105,0.26),-3px_-3px_7px_rgba(255,255,255,1)] border-2 border-emerald-600 scale-[1.02]" : "bg-white shadow-[3px_4px_10px_rgba(15,23,42,0.1),-2px_-2px_5px_rgba(255,255,255,1)] border border-slate-200 text-slate-500 hover:text-slate-800"}`}
                         >
                           <i className={`fas fa-mobile-alt text-lg ${config.aspectRatio === '9:16' ? 'text-emerald-600' : 'text-slate-400'}`}></i>
                           <span className={config.aspectRatio === '9:16' ? 'bg-gradient-to-r from-emerald-700 via-green-600 to-teal-600 bg-clip-text text-transparent drop-shadow-xs' : 'text-slate-600 font-bold'}>
                             9:16 (Dọc)
                           </span>
                         </button>
                       </div>
                     </div>
                   </div>
                   
                   <div className="flex items-end gap-6 bg-slate-100/80 p-6 rounded-2xl border-2 border-slate-200 shadow-[inset_2px_2px_5px_rgba(15,23,42,0.12),inset_-2px_-2px_5px_rgba(255,255,255,1)]">
                     <div className="flex-1">
                       <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-3 block">Thời lượng mong muốn (Phút)</label>
                       <input 
                         type="number" 
                         step="0.5" 
                         min="0.5" 
                         max="10" 
                         className="w-full bg-white border-2 border-slate-300 rounded-xl px-4 py-4 font-black text-2xl text-emerald-700 text-center outline-none focus:border-emerald-500 shadow-[3px_4px_10px_rgba(15,23,42,0.08),-2px_-2px_5px_rgba(255,255,255,1)] focus:ring-2 focus:ring-emerald-100 transition-all" 
                         value={config.durationMin} 
                         onChange={(e) => setConfig(prev => ({ ...prev, durationMin: parseFloat(e.target.value) || 0 }))} 
                       />
                     </div>
                     <div className="p-1 rounded-2xl bg-emerald-100/80 border-2 border-emerald-300 shadow-[inset_2px_2px_5px_rgba(5,150,105,0.2),inset_-2px_-2px_5px_rgba(255,255,255,1)] flex-1">
                       <div className="bg-white p-3 rounded-xl text-center shadow-[2px_3px_8px_rgba(15,23,42,0.08)]">
                         <p className="text-[10px] font-black text-emerald-600 uppercase tracking-tight mb-1">Cấu trúc đề xuất</p>
                         <p className="text-3xl font-black bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 bg-clip-text text-transparent">{numSegments}</p>
                         <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Segments x 8s</p>
                         <div className="mt-2 h-0.5 bg-slate-200 rounded-full w-1/2 mx-auto"></div>
                         <p className="mt-2 text-[10px] text-slate-500 font-bold">{durationSecActual}s (~{(durationSecActual/60).toFixed(1)}p)</p>
                       </div>
                     </div>
                   </div>
                 </div>
              </Card>
            </div>

            <div className="flex justify-between pt-8 border-t border-slate-200">
              <Button variant="neon-yellow" onClick={() => setStep(1)}>
                <i className="fas fa-chevron-left mr-2"></i> Quay lại
              </Button>
              <Button onClick={handleGenerateTimelineFromStep2} disabled={!config.topic || loading} loading={loading} className="w-64 shadow-md">
                Tạo dàn ý Timeline <i className="fas fa-list-check ml-2"></i>
              </Button>
            </div>
          </div>
        )}

         {/* STEP 3: TIMELINE */}
        {step === 3 && (
          <div className="space-y-8 animate-in slide-in-from-bottom-10 duration-500">
            <div className="flex justify-between items-end">
               <div>
                 <h2 className="text-2xl font-black text-slate-900">{config.topic.toUpperCase()}</h2>
                 <p className="bg-gradient-to-r from-emerald-700 via-green-600 to-teal-700 bg-clip-text text-transparent font-black text-sm uppercase tracking-widest mt-1">
                   Timeline Detail Board • {durationSecActual}s • Giữ trọn phong cách gốc
                 </p>
               </div>
               <Button onClick={generateTimelineAgain} loading={loading} variant={config.timeline ? "outline" : "primary"}>
                 <i className="fas fa-wand-magic-sparkles mr-2"></i> {config.timeline ? "Làm mới Timeline" : "AI Tạo Timeline"}
               </Button>
            </div>
            <Card title="Trình soạn thảo chi tiết (Dàn ý kịch bản áp dụng phong cách gốc)">
              <div className="mb-6 bg-emerald-50/80 border border-emerald-200/80 p-5 rounded-2xl text-xs text-emerald-900 font-semibold flex gap-4 items-center shadow-xs">
                <i className="fas fa-info-circle text-xl text-emerald-600"></i>
                <p>Kịch bản dàn ý đã được đồng bộ với phong cách gốc (nhịp điệu, âm thanh SFX, góc máy, lời dẫn). Bạn có thể tự do chỉnh sửa trước khi tạo bảng Prompts.</p>
              </div>
              <div className="p-1.5 rounded-2xl bg-slate-200 border-2 border-slate-300 shadow-[inset_2.5px_3px_6px_rgba(15,23,42,0.18),inset_-2.5px_-3px_6px_rgba(255,255,255,1)]">
                <textarea 
                  className="w-full bg-white border border-slate-200 rounded-xl p-6 h-[550px] outline-none font-mono text-sm leading-8 text-slate-800 custom-scrollbar shadow-inner focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-all"
                  value={config.timeline}
                  onChange={(e) => setConfig(prev => ({ ...prev, timeline: e.target.value }))}
                  placeholder="AI đang chuẩn bị dàn ý..."
                />
              </div>
            </Card>
            <div className="flex justify-between">
              <Button variant="neon-yellow" onClick={() => setStep(2)}>
                <i className="fas fa-chevron-left mr-2"></i> Quay lại
              </Button>
              <Button onClick={generatePrompts} disabled={!config.timeline || loading} loading={loading} variant="success" className="w-64 shadow-md">
                TIẾP TỤC TẠO PROMPT <i className="fas fa-rocket ml-2"></i>
              </Button>
            </div>
          </div>
        )}

        {/* STEP 4: FINAL */}
        {step === 4 && (
          <div className="space-y-10 animate-in zoom-in duration-500">
            <div className="flex flex-col md:flex-row justify-between items-center bg-white p-8 rounded-3xl border border-slate-200 shadow-md gap-6">
               <div className="text-center md:text-left">
                 <h2 className="text-2xl font-black bg-gradient-to-r from-emerald-800 via-green-700 to-teal-800 bg-clip-text text-transparent">
                   HOÀN TẤT CẤU TRÚC PROMPT & VOICE
                 </h2>
                 <p className="text-slate-500 mt-1 font-bold uppercase tracking-widest text-[9px]">
                   Đổi mới nội dung • Giữ 100% phong cách gốc • Chuẩn {numSegments} phân đoạn 8s
                 </p>
               </div>
               <div className="grid grid-cols-2 md:flex flex-wrap gap-3 w-full md:w-auto">
                 <Button onClick={copyAllPrompts} variant="outline" className="text-xs">
                   <i className={`fas ${copiedIndex === 'all-prompts' ? 'fa-check text-emerald-600' : 'fa-copy'} mr-2`}></i>
                   {copiedIndex === 'all-prompts' ? 'Đã chép Prompt!' : 'Sao chép Prompts'}
                 </Button>
                 <Button onClick={copyAllVoices} variant="outline" className="text-xs">
                   <i className={`fas ${copiedIndex === 'all-voices' ? 'fa-check text-emerald-600' : 'fa-copy'} mr-2`}></i>
                   {copiedIndex === 'all-voices' ? 'Đã chép Voice!' : 'Sao chép Voices'}
                 </Button>
                 <Button onClick={downloadPrompts} variant="info" className="text-xs">
                   <i className="fas fa-file-export mr-2"></i> Tải file Prompt
                 </Button>
                 <Button onClick={downloadVoices} variant="success" className="text-xs">
                   <i className="fas fa-microphone mr-2"></i> Tải file Voice
                 </Button>
                 <Button onClick={() => setStep(3)} variant="neon-yellow" className="text-xs">
                   <i className="fas fa-chevron-left mr-2"></i> Quay lại
                 </Button>
               </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
               <div className="bg-slate-50 px-8 py-5 border-b border-slate-200 flex justify-between items-center">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Bảng Phân Đoạn Video AI (8s/shot) • Phong cách: [{config.visualStyle}]
                  </span>
                  <span className="text-[10px] font-black uppercase text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 shadow-xs">
                    {numSegments} Segments x 8s = {durationSecActual}s
                  </span>
               </div>
               <div className="overflow-x-auto">
                 <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-100/70 text-[10px] font-black uppercase tracking-widest text-slate-500">
                        <th className="px-6 py-5 w-16 text-center">STT</th>
                        <th className="px-6 py-5">Prompt Hình Ảnh AI (EN)</th>
                        <th className="px-6 py-5 w-1/3 border-l border-slate-200">Lời dẫn Voice ({config.voiceLang})</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {config.prompts.map((p, i) => (
                        <tr key={i} className="group hover:bg-emerald-50/20 transition-all">
                          <td className="px-6 py-6 font-black text-2xl align-top text-center bg-gradient-to-b from-emerald-600 via-green-600 to-teal-700 bg-clip-text text-transparent">
                            {p.stt}
                          </td>
                          <td className="px-6 py-6 align-top">
                            <div className="relative group/prompt bg-slate-50/90 p-5 rounded-2xl border border-slate-200 text-slate-800 text-xs leading-relaxed font-medium shadow-xs group-hover:border-slate-300 transition-all">
                              <p>{p.prompt}</p>
                              <button
                                onClick={() => copyToClipboard(p.prompt, `prompt-${i}`)}
                                className="mt-3 text-[10px] text-slate-500 hover:text-emerald-600 font-semibold flex items-center gap-1.5 transition-colors"
                              >
                                <i className={`fas ${copiedIndex === `prompt-${i}` ? 'fa-check text-emerald-600' : 'fa-copy'}`}></i>
                                {copiedIndex === `prompt-${i}` ? 'Đã sao chép prompt' : 'Sao chép prompt'}
                              </button>
                            </div>
                          </td>
                          <td className="px-6 py-6 align-top border-l border-slate-200">
                             <div className="relative group/voice bg-emerald-50/40 p-5 rounded-2xl border border-emerald-100/80 shadow-xs">
                                <p className="text-emerald-950 font-medium leading-relaxed text-sm italic">
                                  "{p.voice}"
                                </p>
                                <button
                                  onClick={() => copyToClipboard(p.voice, `voice-${i}`)}
                                  className="mt-3 text-[10px] text-slate-500 hover:text-emerald-600 font-semibold flex items-center gap-1.5 transition-colors"
                                >
                                  <i className={`fas ${copiedIndex === `voice-${i}` ? 'fa-check text-emerald-600' : 'fa-copy'}`}></i>
                                  {copiedIndex === `voice-${i}` ? 'Đã sao chép voice' : 'Sao chép voice'}
                                </button>
                             </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                 </table>
               </div>
            </div>
          </div>
        )}
      </main>

      {/* GLOBAL LOADING */}
      {loading && (
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-md z-[100] flex items-center justify-center animate-in fade-in">
          <div className="bg-white border border-slate-200 p-12 rounded-[2.5rem] shadow-2xl flex flex-col items-center max-w-sm w-full mx-4 border-t-indigo-600 border-t-4">
             <div className="relative mb-8">
               <div className="w-20 h-20 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
               <div className="absolute inset-0 flex items-center justify-center">
                 <i className="fas fa-brain text-indigo-600 animate-pulse text-2xl"></i>
               </div>
             </div>
             <h3 className="text-slate-900 font-black uppercase tracking-widest text-sm mb-3">Đang xử lý dữ liệu...</h3>
             <p className="text-slate-500 text-[10px] font-bold text-center leading-relaxed">Gemini AI đang tối ưu hóa kịch bản của bạn. Vui lòng không đóng cửa sổ này.</p>
          </div>
        </div>
      )}
    </div>
  );
}
