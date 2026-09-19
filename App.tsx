import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { GeminiService } from './services/geminiService';
import { VideoConfig, VideoMode, VisualStyle, PromptRow } from './types';
import { PaymentModal } from './components/PaymentModal';
import { TrialModal } from './components/TrialModal';
import { AdminDashboard } from './components/AdminDashboard';

// Helper components
const Button: React.FC<{ 
  onClick?: () => void; 
  disabled?: boolean; 
  className?: string; 
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'outline' | 'ghost' | 'info' | 'gemini' | 'neon-yellow' | 'blue' | 'trial' | 'featured' | 'settings';
  children: React.ReactNode;
}> = ({ onClick, disabled, className = '', loading, variant = 'primary', children }) => {
  const variantStyles: Record<string, string> = {
    primary: "bg-[#064957] hover:bg-[#085a6b] text-white border border-[#00D9F5]/70 shadow-[0_0_12px_rgba(0,217,245,0.22)]",
    trial: "bg-[#064957] hover:bg-[#085a6b] text-white border-2 border-[#00D9F5] shadow-[0_0_14px_rgba(0,217,245,0.28)]",
    featured: "bg-gradient-to-r from-[#FFB800] via-[#E6F000] via-[#12D96B] to-[#05C7A5] hover:opacity-95 text-[#031A12] font-black border border-yellow-200/60 shadow-[0_0_16px_rgba(18,217,107,0.35)]",
    settings: "bg-[#042B22]/90 hover:bg-[#042B22] text-[#05C7A5] border border-[#05C7A5]/60 shadow-[0_0_10px_rgba(5,199,165,0.2)]",
    success: "bg-gradient-to-r from-[#12D96B] to-[#05C7A5] hover:opacity-95 text-[#031A12] font-black shadow-[0_0_12px_rgba(18,217,107,0.3)]",
    outline: "bg-white hover:bg-[#F3F8FA] text-[#064957] border border-[#D8E2E8] hover:border-[#05C7A5] shadow-xs",
    'neon-yellow': "bg-white hover:bg-[#F3F8FA] text-slate-700 border border-[#D8E2E8] hover:border-slate-400 shadow-xs",
    gemini: "bg-[#064957] hover:bg-[#085a6b] text-white border border-[#00D9F5]/70 shadow-[0_0_10px_rgba(0,217,245,0.2)]",
    info: "bg-[#F3F8FA] hover:bg-white text-[#064957] border border-[#D8E2E8] shadow-xs",
    secondary: "bg-[#06251A] hover:bg-[#042B22] text-[#4DD6A8] border border-[#05C7A5]/40 shadow-xs",
    danger: "bg-rose-600 hover:bg-rose-700 text-white shadow-sm",
    ghost: "bg-transparent text-slate-600 hover:text-[#05C7A5]",
    blue: "bg-[#064957] text-white border border-[#00D9F5]"
  };

  return (
    <button 
      type="button"
      onClick={onClick} 
      disabled={disabled || loading} 
      className={`px-5 py-2.5 rounded-xl font-black text-sm transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98] ${variantStyles[variant] || variantStyles.primary} ${className}`}
    >
      {loading ? (
        <i className="fas fa-spinner fa-spin text-[#00D9F5]"></i>
      ) : (
        children
      )}
    </button>
  );
};

const Card: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className = '' }) => (
  <div className={`bg-white border border-[#D8E2E8] rounded-2xl p-6 sm:p-7 shadow-[0_4px_16px_rgba(6,37,26,0.06)] ${className}`}>
    <div className="flex items-center gap-3 mb-6">
      <div className="w-2 h-7 bg-gradient-to-b from-[#00D9F5] via-[#05C7A5] to-[#12D96B] rounded-full shadow-[0_0_8px_rgba(5,199,165,0.4)]"></div>
      <h3 className="text-base sm:text-lg font-black bg-gradient-to-r from-[#064957] via-[#05C7A5] to-[#047857] bg-clip-text text-transparent uppercase tracking-tight">
        {title}
      </h3>
    </div>
    {children}
  </div>
);

export default function App() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSystemReady, setIsSystemReady] = useState(true);
  
  // Modals & Subscription States
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isTrialOpen, setIsTrialOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
  const [subscription, setSubscription] = useState<any>(null);
  const [trialNotice, setTrialNotice] = useState<string | null>(null);
  const [paymentConfig, setPaymentConfig] = useState<any>({
    trial_active: true,
    trial_hours: 24,
    trial_title: 'Dùng thử miễn phí',
    trial_description: 'Trải nghiệm 24 giờ sử dụng trọn bộ tính năng video AI.',
    trial_app_redirect_url: ''
  });

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

  // Check user subscription status from backend
  const checkSubscription = useCallback(async () => {
    const sessionStr = localStorage.getItem('app_user_session');
    if (!sessionStr) {
      setSubscription(null);
      setHasActiveSubscription(false);
      return;
    }
    try {
      const session = JSON.parse(sessionStr);
      const identifier = session.email || session.phone;
      if (!identifier) {
        setHasActiveSubscription(false);
        return;
      }
      const res = await fetch(`/api/subscription/check?email=${encodeURIComponent(identifier)}`);
      const data = await res.json();
      if (data.hasAccess && data.subscription) {
        setSubscription(data.subscription);
        setHasActiveSubscription(true);
      } else {
        setSubscription(null);
        setHasActiveSubscription(false);
      }
    } catch (err) {
      console.warn('Subscription check error:', err);
    }
  }, []);

  // Fetch payment configuration & check subscription on mount
  useEffect(() => {
    fetch('/api/payment-config')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setPaymentConfig(data);
        }
      })
      .catch(err => console.warn('Payment config fetch error:', err));

    checkSubscription();
  }, [checkSubscription]);

  // Check for trial activation token from email link
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const trialToken = urlParams.get('trial_token');
    if (trialToken) {
      fetch('/api/trial/activate-by-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: trialToken,
          device_id: navigator.userAgent
        })
      })
        .then(res => res.json())
        .then(data => {
          if (data.success && data.subscription) {
            const sub = data.subscription;
            setSubscription(sub);
            setHasActiveSubscription(true);
            localStorage.setItem('app_user_session', JSON.stringify({
              name: sub.customer_name,
              email: sub.customer_email,
              phone: sub.customer_phone
            }));
            const hours = paymentConfig.trial_hours || 24;
            setTrialNotice(`🎉 Kích hoạt dùng thử thành công từ email! Chào mừng ${sub.customer_name || ''}, bạn có ${hours} giờ sử dụng trọn bộ tính năng AI.`);
            setError(null);

            // Clean URL query parameters
            window.history.replaceState({}, document.title, window.location.pathname);

            // Scroll to workspace
            setTimeout(() => {
              const el = document.getElementById('main-workspace') || document.querySelector('main');
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 300);
          } else {
            setError(data.error || 'Không thể kích hoạt dùng thử. Liên kết có thể đã hết hạn.');
          }
        })
        .catch(err => {
          console.warn('Activate trial error:', err);
          setError('Lỗi kích hoạt liên kết dùng thử: ' + err.message);
        });
    }
  }, [paymentConfig.trial_hours]);

  const handleApiError = useCallback((err: any) => {
    if (err.message?.includes('SUBSCRIPTION_REQUIRED')) {
      setError("Bạn cần mua gói hoặc đăng ký dùng thử để sử dụng công cụ này.");
      setIsPaymentOpen(true);
    } else if (err.message?.includes('429') || err.message?.includes('RESOURCE_EXHAUSTED') || err.message === 'QUOTA_EXHAUSTED') {
      setError("Hệ thống AI đang bận hoặc vượt quá lưu lượng, vui lòng thử lại sau giây lát.");
    } else {
      setError(err.message || "Đã xảy ra lỗi kết nối AI.");
    }
  }, []);

  // Gatekeeper: Check active subscription before calling AI features
  const requireSubscription = (): boolean => {
    if (!hasActiveSubscription) {
      setError("Bạn cần mua gói hoặc đăng ký dùng thử để sử dụng công cụ này.");
      setIsPaymentOpen(true);
      return false;
    }
    return true;
  };

  const handleNextFromStep1 = async () => {
    if (!requireSubscription()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await gemini.generateInitialSetup(config.summary, config.styleAnalysis, config.mode, config.visualStyle);
      setConfig(prev => ({ ...prev, topic: result.topic, background: result.background }));
      setStep(2);
    } catch (err) {
      handleApiError(err);
      if (!hasActiveSubscription) return;
      setStep(2); 
    } finally {
      setLoading(false);
    }
  };

  const regenerateTopic = async () => {
    if (!requireSubscription()) return;
    setLoading(true);
    try {
      const topic = await gemini.generateTopic(config.summary, config.styleAnalysis, config.mode);
      const bg = await gemini.generateBackground(topic, config.visualStyle, config.styleAnalysis);
      setConfig(prev => ({ ...prev, topic, background: bg }));
    } catch (err) { handleApiError(err); }
    finally { setLoading(false); }
  };

  const regenerateBackground = async () => {
    if (!requireSubscription()) return;
    setLoading(true);
    try {
      const bg = await gemini.generateBackground(config.topic, config.visualStyle, config.styleAnalysis);
      setConfig(prev => ({ ...prev, background: bg }));
    } catch (err) { handleApiError(err); }
    finally { setLoading(false); }
  };

  const handleGenerateTimelineFromStep2 = async () => {
    if (!requireSubscription()) return;
    setLoading(true);
    setError(null);
    try {
      const durationSecActual = Math.ceil(config.durationMin * 60 / 8) * 8;
      const tl = await gemini.generateTimeline(config.topic, config.background, durationSecActual, config.styleAnalysis);
      setConfig(prev => ({ ...prev, timeline: tl }));
      setStep(3);
    } catch (err) {
      handleApiError(err);
      if (!hasActiveSubscription) return;
      setStep(3);
    } finally {
      setLoading(false);
    }
  };

  const generateTimelineAgain = async () => {
    if (!requireSubscription()) return;
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
    if (!requireSubscription()) return;
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
    <div className="min-h-screen pb-20 bg-[#031A12] text-slate-800 font-['Plus_Jakarta_Sans',sans-serif]">
      
      {/* HEADER WITH BLUE PURCHASE BUTTON & ACTIONS */}
      <header className="bg-[#06251A]/95 backdrop-blur-md border-b border-[#12D96B]/30 py-3.5 px-4 sm:px-6 sticky top-0 z-50 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
          
          {/* Left: Brand Identity */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
            <div className="flex items-center gap-3">
              <div className="relative group shrink-0">
                <div className="w-11 h-11 rounded-full overflow-hidden shadow-md border-2 border-[#00D9F5] bg-[#031A12] ring-2 ring-[#05C7A5]/30 flex items-center justify-center">
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
                <h1 className="text-base sm:text-xl font-black tracking-tight uppercase bg-gradient-to-r from-[#00D9F5] via-[#05C7A5] to-[#12D96B] bg-clip-text text-transparent drop-shadow-xs leading-snug">
                  VIDEO AI BÁN CONTENT - HUYNH HONG
                </h1>
                <p className="text-[10px] text-[#4DD6A8]/80 font-bold uppercase tracking-wider hidden sm:block">
                  Công Nghệ Phân Tích & Sản Xuất Video AI Đỉnh Cao
                </p>
              </div>
            </div>

            {/* Mobile quick indicators - Nút cài đặt */}
            <div className="md:hidden flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsAdminOpen(true)}
                className="w-8 h-8 rounded-xl bg-[#042B22] text-[#05C7A5] hover:text-[#00D9F5] border border-[#05C7A5]/60 flex items-center justify-center text-xs"
                title="Quản trị viên"
              >
                <i className="fas fa-shield-alt text-[#05C7A5]"></i>
              </button>
            </div>
          </div>

          {/* Right: Actions & Payment Buttons */}
          <div className="flex flex-wrap items-center justify-end gap-2.5 w-full md:w-auto">
            
            {/* Status Badges */}
            {hasActiveSubscription ? (
              <div className="flex items-center gap-2">
                {subscription?.subscription_type === 'paid' ? (
                  <div className="text-[11px] font-black text-[#4DD6A8] bg-[#042B22] px-3 py-1.5 rounded-xl border border-[#05C7A5]/50 flex items-center gap-1.5 shadow-xs">
                    <i className="fas fa-crown text-[#FFB800]"></i>
                    <span>{subscription?.plan_name || 'Gói Vĩnh Viễn'}</span>
                  </div>
                ) : (
                  <div className="text-[11px] font-black text-[#00D9F5] bg-[#064957] px-3 py-1.5 rounded-xl border border-[#00D9F5]/50 flex items-center gap-1.5 shadow-xs">
                    <i className="fas fa-clock text-[#00D9F5]"></i>
                    <span>Dùng thử (~{subscription?.remainingHours || 24}h)</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-[11px] font-bold text-amber-300 bg-[#042B22] px-3 py-1.5 rounded-xl border border-amber-500/50 flex items-center gap-1.5 shadow-xs">
                <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></div>
                <span>Chưa kích hoạt gói</span>
              </div>
            )}

            {/* Nút trải nghiệm (Dùng thử miễn phí) */}
            {(!hasActiveSubscription || subscription?.subscription_type === 'trial') && paymentConfig.trial_active && (
              <button
                type="button"
                onClick={() => setIsTrialOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-[#064957] hover:bg-[#085a6b] text-white border-2 border-[#00D9F5] font-black text-xs flex items-center gap-1.5 transition-all shadow-[0_0_12px_rgba(0,217,245,0.25)] hover:shadow-[0_0_18px_rgba(0,217,245,0.4)] active:scale-95 cursor-pointer"
              >
                <i className="fas fa-gift text-xs text-[#00D9F5]"></i>
                <span>Dùng thử</span>
              </button>
            )}

            {/* Nút gói nổi bật (Mua Gói / Nâng Cấp) */}
            <button
              type="button"
              onClick={() => setIsPaymentOpen(true)}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#FFB800] via-[#E6F000] via-[#12D96B] to-[#05C7A5] hover:opacity-95 text-[#031A12] font-black text-xs flex items-center gap-2 transition-all shadow-[0_0_16px_rgba(18,217,107,0.35)] hover:shadow-[0_0_22px_rgba(255,184,0,0.5)] active:scale-95 cursor-pointer border border-yellow-200/50"
            >
              <i className="fas fa-gem text-[#031A12] text-xs"></i>
              <span>{hasActiveSubscription && subscription?.subscription_type === 'paid' ? 'Gia hạn gói' : 'Mua Gói / Nâng Cấp'}</span>
            </button>

            {/* Nút cài đặt (Desktop) */}
            <button
              type="button"
              onClick={() => setIsAdminOpen(true)}
              className="hidden md:flex w-9 h-9 rounded-xl bg-[#042B22]/90 hover:bg-[#042B22] text-[#05C7A5] hover:text-[#00D9F5] items-center justify-center text-xs transition-colors border border-[#05C7A5]/60 hover:border-[#05C7A5] shadow-[0_0_10px_rgba(5,199,165,0.2)] cursor-pointer"
              title="Mở Quản trị viên SePay"
            >
              <i className="fas fa-shield-alt text-[#05C7A5]"></i>
            </button>

          </div>
        </div>
      </header>

      {/* Khung nội dung chính: trắng ngà rất nhẹ, khoảng #FCFDFC, bo góc lớn, nổi bật trên nền tối */}
      <main id="main-workspace" className="max-w-5xl mx-auto my-7 px-5 sm:px-8 py-8 bg-[#FCFDFC] rounded-3xl shadow-[0_25px_60px_rgba(0,0,0,0.45)] border border-[#D8E2E8]">

        {/* Trial Success / Active Banner */}
        {trialNotice && (
          <div className="bg-emerald-50 border-2 border-emerald-300 text-emerald-900 px-5 py-3.5 rounded-2xl mb-6 flex items-center justify-between shadow-sm animate-in fade-in">
            <div className="flex items-center gap-3">
              <i className="fas fa-check-circle text-emerald-600 text-lg"></i>
              <span className="text-xs sm:text-sm font-bold">{trialNotice}</span>
            </div>
            <button 
              onClick={() => setTrialNotice(null)} 
              className="text-emerald-500 hover:text-emerald-800 text-sm font-bold ml-4 cursor-pointer"
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
        )}

        {/* Global Error Banner */}
        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 px-5 py-3.5 rounded-2xl mb-6 flex items-center justify-between shadow-sm animate-in fade-in">
            <div className="flex items-center gap-3">
              <i className="fas fa-exclamation-triangle text-rose-500 text-base"></i>
              <span className="text-sm font-semibold">{error}</span>
            </div>
            <button 
              onClick={() => setError(null)} 
              className="text-rose-400 hover:text-rose-700 text-sm font-bold ml-4"
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
        )}

        {/* STEP 1: INPUT */}
        {step === 1 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-top-4 duration-500">
            {/* Guide Section */}
            <div className="bg-[#F3F8FA] border border-[#D8E2E8] rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex gap-4 items-start">
                <div className="mt-1 flex-shrink-0">
                   <div className="w-6 h-6 rounded-full border border-[#00D9F5] bg-white shadow-xs flex items-center justify-center text-[#064957] text-xs font-bold">i</div>
                </div>
                <div className="space-y-2 text-sm leading-relaxed">
                  <p className="text-slate-700 font-medium">
                    Cách lấy thông tin video: copy đường link video rồi đưa vào Gemini kết hợp với câu lệnh <span className="italic font-bold text-[#064957]">"Phân tích cho tôi Nội dung và phong cách video trên"</span>.
                  </p>
                  <p className="text-[#064957] font-bold bg-white border border-[#D8E2E8] p-2.5 rounded-xl text-xs">
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
                <div className="p-1.5 rounded-2xl bg-[#F3F8FA] border border-[#D8E2E8] shadow-xs">
                  <textarea 
                    className="w-full bg-white border border-[#D8E2E8] rounded-xl p-4 h-64 outline-none focus:border-[#05C7A5] text-slate-800 font-medium placeholder:text-slate-400 focus:ring-2 focus:ring-[#05C7A5]/20 transition-all resize-none custom-scrollbar shadow-xs"
                    placeholder="Dán nội dung video gốc vào đây (cốt truyện, nhân vật, sự kiện cũ)..."
                    value={config.summary}
                    onChange={(e) => setConfig(prev => ({ ...prev, summary: e.target.value }))}
                  />
                </div>
              </Card>
              <Card title="Phân tích phong cách gốc (Sẽ giữ nguyên)">
                <div className="p-1.5 rounded-2xl bg-[#F3F8FA] border border-[#D8E2E8] shadow-xs">
                  <textarea 
                    className="w-full bg-white border border-[#D8E2E8] rounded-xl p-4 h-64 outline-none focus:border-[#05C7A5] text-slate-800 font-medium placeholder:text-slate-400 focus:ring-2 focus:ring-[#05C7A5]/20 transition-all resize-none custom-scrollbar shadow-xs"
                    placeholder="Nhịp điệu dồn dập hay lắng đọng, gam màu điện ảnh/cyberpunk, âm thanh hào hùng/bí ẩn, góc quay cận cảnh/drone, văn phong giọng đọc..."
                    value={config.styleAnalysis}
                    onChange={(e) => setConfig(prev => ({ ...prev, styleAnalysis: e.target.value }))}
                  />
                </div>
              </Card>
            </div>
            
            {/* Mode selection - Khung danh sách bên trong: xanh xám cực nhạt #F3F8FA, viền #D8E2E8 */}
            <div className="p-4 rounded-3xl bg-[#F3F8FA] border border-[#D8E2E8] shadow-xs">
              <label className="text-[11px] font-black text-[#064957] uppercase tracking-widest block mb-3 px-1">
                Lựa chọn phương thức sáng tạo nội dung mới (Đều giữ nguyên phong cách gốc)
              </label>
              <div className="grid md:grid-cols-2 gap-4">
                
                {/* Thẻ 1: Đổi mới nội dung */}
                <div 
                  onClick={() => setConfig(prev => ({ ...prev, mode: VideoMode.Different }))}
                  className={`rounded-2xl transition-all cursor-pointer ${
                    config.mode === VideoMode.Different 
                      ? 'p-[2px] bg-gradient-to-r from-[#FF9D00] via-[#E7E600] via-[#48D52B] to-[#00BFA5] shadow-md' 
                      : 'p-[2px] bg-transparent'
                  }`}
                >
                  <div className={`w-full p-4 rounded-[14px] text-left transition-all ${
                    config.mode === VideoMode.Different
                      ? 'bg-white'
                      : 'bg-white border border-[#D8E2E8] hover:border-[#05C7A5]/50 shadow-xs'
                  }`}>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-3.5 h-3.5 rounded-full ${
                          config.mode === VideoMode.Different 
                            ? 'bg-[#4DD6A8] ring-4 ring-[#4DD6A8]/30 animate-pulse' 
                            : 'bg-slate-200 border border-slate-300'
                        }`}></div>
                        <span className={`font-black text-sm ${
                          config.mode === VideoMode.Different 
                            ? 'bg-gradient-to-r from-[#064957] via-[#05C7A5] to-[#12D96B] bg-clip-text text-transparent' 
                            : 'text-slate-700'
                        }`}>
                          Đổi Mới Nội Dung Hoàn Toàn (Khuyên dùng)
                        </span>
                      </div>
                      {config.mode === VideoMode.Different && (
                        <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-md bg-[#4DD6A8] text-[#031A12] shrink-0">
                          Đang chọn
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 pl-6 leading-relaxed font-medium">
                      Tạo chủ đề & cốt truyện mới 100% để tránh trùng lặp/bản quyền, kế thừa 100% phong cách nghệ thuật gốc.
                    </p>
                  </div>
                </div>

                {/* Thẻ 2: Tương tự nâng cao */}
                <div 
                  onClick={() => setConfig(prev => ({ ...prev, mode: VideoMode.Similar }))}
                  className={`rounded-2xl transition-all cursor-pointer ${
                    config.mode === VideoMode.Similar 
                      ? 'p-[2px] bg-gradient-to-r from-[#FF9D00] via-[#E7E600] via-[#48D52B] to-[#00BFA5] shadow-md' 
                      : 'p-[2px] bg-transparent'
                  }`}
                >
                  <div className={`w-full p-4 rounded-[14px] text-left transition-all ${
                    config.mode === VideoMode.Similar
                      ? 'bg-white'
                      : 'bg-white border border-[#D8E2E8] hover:border-[#05C7A5]/50 shadow-xs'
                  }`}>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-3.5 h-3.5 rounded-full ${
                          config.mode === VideoMode.Similar 
                            ? 'bg-[#4DD6A8] ring-4 ring-[#4DD6A8]/30 animate-pulse' 
                            : 'bg-slate-200 border border-slate-300'
                        }`}></div>
                        <span className={`font-black text-sm ${
                          config.mode === VideoMode.Similar 
                            ? 'bg-gradient-to-r from-[#064957] via-[#05C7A5] to-[#12D96B] bg-clip-text text-transparent' 
                            : 'text-slate-700'
                        }`}>
                          Nội Dung Tương Tự Nâng Cao
                        </span>
                      </div>
                      {config.mode === VideoMode.Similar && (
                        <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-md bg-[#4DD6A8] text-[#031A12] shrink-0">
                          Đang chọn
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 pl-6 leading-relaxed font-medium">
                      Cùng trục chủ đề nhưng viết mới toàn bộ kịch bản, khai thác góc nhìn sâu sắc hơn, giữ trọn phong cách gốc.
                    </p>
                  </div>
                </div>

              </div>
            </div>

            <div className="flex justify-end">
              <Button 
                onClick={handleNextFromStep1} 
                disabled={!config.summary || !config.styleAnalysis || loading} 
                loading={loading} 
                className="w-64 shadow-md"
              >
                {!hasActiveSubscription && <i className="fas fa-lock mr-1.5 text-amber-500"></i>}
                Phân tích & Tiếp tục <i className="fas fa-arrow-right ml-2 text-xs"></i>
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: CONFIG */}
        {step === 2 && (
          <div className="space-y-8 animate-in slide-in-from-right-10 duration-500">
            {/* Style reminder chip */}
            <div className="p-2 rounded-2xl bg-[#F3F8FA] border border-[#D8E2E8] shadow-xs">
              <div className="bg-white px-5 py-3 rounded-xl flex items-center justify-between shadow-xs border border-[#D8E2E8]">
                <div className="flex items-center gap-2.5 text-xs text-slate-800">
                  <i className="fas fa-palette text-[#00D9F5] text-sm"></i>
                  <span className="font-extrabold">Phong cách gốc đang áp dụng:</span>
                  <span className="text-[#064957] font-semibold italic truncate max-w-lg">"{config.styleAnalysis}"</span>
                </div>
                <span className="text-[10px] bg-[#042B22] text-[#4DD6A8] border border-[#05C7A5]/40 px-3 py-1 rounded-lg font-black uppercase shadow-xs">
                  {config.mode === VideoMode.Different ? 'Đổi mới Content 100%' : 'Tương tự nâng cao'}
                </span>
              </div>
            </div>

            <Card title="Chủ đề & Bối cảnh (AI Tự động - Đổi mới nội dung theo phong cách)">
              <div className="space-y-8">
                <div>
                  <div className="flex justify-between items-center mb-3 px-1">
                    <label className="text-[11px] font-black text-[#064957] uppercase tracking-widest">Chủ đề mới muốn làm</label>
                    <Button variant="outline" onClick={regenerateTopic} loading={loading} className="py-1 px-4 text-[10px] rounded-lg h-8">
                      {!hasActiveSubscription && <i className="fas fa-lock mr-1 text-amber-500"></i>}
                      <i className="fas fa-wand-sparkles mr-1 text-[#00D9F5]"></i> AI Tạo chủ đề khác
                    </Button>
                  </div>
                  <div className="p-1.5 rounded-2xl bg-[#F3F8FA] border border-[#D8E2E8] shadow-xs">
                    <textarea 
                      className="w-full bg-white border border-[#D8E2E8] rounded-xl p-4 h-24 outline-none focus:border-[#05C7A5] text-slate-800 font-bold resize-none custom-scrollbar shadow-xs focus:ring-2 focus:ring-[#05C7A5]/20 transition-all"
                      value={config.topic}
                      onChange={(e) => setConfig(prev => ({ ...prev, topic: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-3 px-1">
                    <label className="text-[11px] font-black text-[#064957] uppercase tracking-widest">Bối cảnh / Nền tảng (Kế thừa phong cách nghệ thuật)</label>
                    <Button variant="outline" onClick={regenerateBackground} loading={loading} className="py-1 px-4 text-[10px] rounded-lg h-8">
                      {!hasActiveSubscription && <i className="fas fa-lock mr-1 text-amber-500"></i>}
                      <i className="fas fa-sync mr-1 text-[#00D9F5]"></i> Tạo lại bối cảnh
                    </Button>
                  </div>
                  <div className="p-1.5 rounded-2xl bg-[#F3F8FA] border border-[#D8E2E8] shadow-xs">
                    <textarea 
                      className="w-full bg-white border border-[#D8E2E8] rounded-xl p-4 h-28 outline-none focus:border-[#05C7A5] text-slate-700 font-medium resize-none custom-scrollbar shadow-xs focus:ring-2 focus:ring-[#05C7A5]/20 transition-all"
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
                    {Object.values(VisualStyle).map(v => {
                      const isSelected = config.visualStyle === v;
                      return (
                        <div 
                          key={v} 
                          onClick={() => setConfig(prev => ({ ...prev, visualStyle: v }))}
                          className={`rounded-2xl transition-all cursor-pointer ${
                            isSelected 
                              ? "p-[2px] bg-gradient-to-r from-[#FF9D00] via-[#E7E600] via-[#48D52B] to-[#00BFA5] shadow-md" 
                              : "p-[2px] bg-transparent"
                          }`}
                        >
                          <div className={`w-full py-3 rounded-[14px] text-[11px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                            isSelected 
                              ? "bg-white text-[#031A12] shadow-xs" 
                              : "bg-white border border-[#D8E2E8] hover:border-[#05C7A5]/50 text-slate-600 shadow-xs"
                          }`}>
                            {isSelected && <span className="w-2 h-2 rounded-full bg-[#4DD6A8] shadow-[0_0_6px_#4DD6A8]"></span>}
                            <span>{v}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>

                <Card title="Ngôn ngữ Voice">
                  <div className="grid grid-cols-3 gap-2.5">
                    {languages.map(lang => {
                      const isSelected = config.voiceLang === lang;
                      return (
                        <div 
                          key={lang} 
                          onClick={() => setConfig(prev => ({ ...prev, voiceLang: lang }))}
                          className={`rounded-xl transition-all cursor-pointer ${
                            isSelected 
                              ? "p-[2px] bg-gradient-to-r from-[#FF9D00] via-[#E7E600] via-[#48D52B] to-[#00BFA5] shadow-md" 
                              : "p-[2px] bg-transparent"
                          }`}
                        >
                          <div className={`w-full py-2 px-1 rounded-[10px] text-[10px] font-black transition-all flex items-center justify-center gap-1 ${
                            isSelected 
                              ? "bg-white text-[#031A12] shadow-xs" 
                              : "bg-white border border-[#D8E2E8] text-slate-600 hover:border-[#05C7A5]/50 shadow-xs"
                          }`}>
                            {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-[#4DD6A8]"></span>}
                            <span>{lang}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-4 text-[10px] text-slate-500 font-bold italic text-center">
                    * Giữ nguyên ngữ điệu & cảm xúc của video gốc, tối ưu độ dài chuẩn 8 giây mỗi phân cảnh.
                  </p>
                </Card>
              </div>

              <Card title="Kỹ thuật video">
                 <div className="space-y-8 h-full flex flex-col justify-center">
                   <div>
                     <label className="text-[10px] font-black text-[#064957] uppercase tracking-widest mb-3 block">Tỷ lệ khung hình</label>
                     <div className="flex gap-4">
                       
                       {/* 16:9 */}
                       <div 
                         onClick={() => setConfig(prev => ({ ...prev, aspectRatio: '16:9' }))}
                         className={`flex-1 rounded-2xl transition-all cursor-pointer ${
                           config.aspectRatio === '16:9' 
                             ? 'p-[2px] bg-gradient-to-r from-[#FF9D00] via-[#E7E600] via-[#48D52B] to-[#00BFA5] shadow-md' 
                             : 'p-[2px] bg-transparent'
                         }`}
                       >
                         <div className={`w-full py-4 rounded-[14px] font-black transition-all flex flex-col items-center gap-1.5 ${
                           config.aspectRatio === '16:9'
                             ? 'bg-white shadow-xs'
                             : 'bg-white border border-[#D8E2E8] hover:border-[#05C7A5]/50 shadow-xs text-slate-600'
                         }`}>
                           <i className={`fas fa-desktop text-lg ${config.aspectRatio === '16:9' ? 'text-[#064957]' : 'text-slate-400'}`}></i>
                           <span className={config.aspectRatio === '16:9' ? 'font-black text-[#031A12]' : 'text-slate-600 font-bold'}>
                             16:9 (Ngang)
                           </span>
                           {config.aspectRatio === '16:9' && (
                             <span className="text-[9px] font-black px-2 py-0.5 rounded bg-[#4DD6A8] text-[#031A12]">ĐANG CHỌN</span>
                           )}
                         </div>
                       </div>

                       {/* 9:16 */}
                       <div 
                         onClick={() => setConfig(prev => ({ ...prev, aspectRatio: '9:16' }))}
                         className={`flex-1 rounded-2xl transition-all cursor-pointer ${
                           config.aspectRatio === '9:16' 
                             ? 'p-[2px] bg-gradient-to-r from-[#FF9D00] via-[#E7E600] via-[#48D52B] to-[#00BFA5] shadow-md' 
                             : 'p-[2px] bg-transparent'
                         }`}
                       >
                         <div className={`w-full py-4 rounded-[14px] font-black transition-all flex flex-col items-center gap-1.5 ${
                           config.aspectRatio === '9:16'
                             ? 'bg-white shadow-xs'
                             : 'bg-white border border-[#D8E2E8] hover:border-[#05C7A5]/50 shadow-xs text-slate-600'
                         }`}>
                           <i className={`fas fa-mobile-alt text-lg ${config.aspectRatio === '9:16' ? 'text-[#064957]' : 'text-slate-400'}`}></i>
                           <span className={config.aspectRatio === '9:16' ? 'font-black text-[#031A12]' : 'text-slate-600 font-bold'}>
                             9:16 (Dọc)
                           </span>
                           {config.aspectRatio === '9:16' && (
                             <span className="text-[9px] font-black px-2 py-0.5 rounded bg-[#4DD6A8] text-[#031A12]">ĐANG CHỌN</span>
                           )}
                         </div>
                       </div>

                     </div>
                   </div>
                   
                   <div className="flex items-end gap-6 bg-[#F3F8FA] p-6 rounded-2xl border border-[#D8E2E8] shadow-xs">
                     <div className="flex-1">
                       <label className="text-[10px] font-black text-[#064957] uppercase tracking-widest mb-3 block">Thời lượng mong muốn (Phút)</label>
                       <input 
                         type="number" 
                         step="0.5" 
                         min="0.5" 
                         max="10" 
                         className="w-full bg-white border border-[#D8E2E8] rounded-xl px-4 py-4 font-black text-2xl text-[#064957] text-center outline-none focus:border-[#05C7A5] shadow-xs focus:ring-2 focus:ring-[#05C7A5]/20 transition-all" 
                         value={config.durationMin} 
                         onChange={(e) => setConfig(prev => ({ ...prev, durationMin: parseFloat(e.target.value) || 0 }))} 
                       />
                     </div>
                     <div className="p-[2px] rounded-2xl bg-gradient-to-r from-[#00D9F5] to-[#05C7A5] flex-1 shadow-xs">
                       <div className="bg-white p-3 rounded-[14px] text-center shadow-xs">
                         <p className="text-[10px] font-black text-[#064957] uppercase tracking-tight mb-1">Cấu trúc đề xuất</p>
                         <p className="text-3xl font-black text-[#064957]">{numSegments}</p>
                         <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Segments x 8s</p>
                         <div className="mt-2 h-0.5 bg-[#D8E2E8] rounded-full w-1/2 mx-auto"></div>
                         <p className="mt-2 text-[10px] text-slate-500 font-bold">{durationSecActual}s (~{(durationSecActual/60).toFixed(1)}p)</p>
                       </div>
                     </div>
                   </div>
                 </div>
              </Card>
            </div>

            <div className="flex justify-between pt-8 border-t border-[#D8E2E8]">
              <Button variant="outline" onClick={() => setStep(1)}>
                <i className="fas fa-chevron-left mr-2"></i> Quay lại
              </Button>
              <Button 
                onClick={handleGenerateTimelineFromStep2} 
                disabled={!config.topic || loading} 
                loading={loading} 
                className="w-64 shadow-md"
              >
                {!hasActiveSubscription && <i className="fas fa-lock mr-1.5 text-amber-500"></i>}
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
                 <h2 className="text-2xl font-black text-[#031A12]">{config.topic.toUpperCase()}</h2>
                 <p className="bg-gradient-to-r from-[#064957] via-[#05C7A5] to-[#12D96B] bg-clip-text text-transparent font-black text-sm uppercase tracking-widest mt-1">
                   Timeline Detail Board • {durationSecActual}s • Giữ trọn phong cách gốc
                 </p>
               </div>
               <Button onClick={generateTimelineAgain} loading={loading} variant={config.timeline ? "outline" : "primary"}>
                 {!hasActiveSubscription && <i className="fas fa-lock mr-1 text-amber-500"></i>}
                 <i className="fas fa-wand-magic-sparkles mr-2 text-[#00D9F5]"></i> {config.timeline ? "Làm mới Timeline" : "AI Tạo Timeline"}
               </Button>
            </div>
            <Card title="Trình soạn thảo chi tiết (Dàn ý kịch bản áp dụng phong cách gốc)">
              <div className="mb-6 bg-[#F3F8FA] border border-[#D8E2E8] p-5 rounded-2xl text-xs text-[#064957] font-semibold flex gap-4 items-center shadow-xs">
                <i className="fas fa-info-circle text-xl text-[#00D9F5]"></i>
                <p>Kịch bản dàn ý đã được đồng bộ với phong cách gốc (nhịp điệu, âm thanh SFX, góc máy, lời dẫn). Bạn có thể tự do chỉnh sửa trước khi tạo bảng Prompts.</p>
              </div>
              <div className="p-1.5 rounded-2xl bg-[#F3F8FA] border border-[#D8E2E8] shadow-xs">
                <textarea 
                  className="w-full bg-white border border-[#D8E2E8] rounded-xl p-6 h-[550px] outline-none font-mono text-sm leading-8 text-slate-800 custom-scrollbar shadow-xs focus:border-[#05C7A5] focus:ring-2 focus:ring-[#05C7A5]/20 transition-all"
                  value={config.timeline}
                  onChange={(e) => setConfig(prev => ({ ...prev, timeline: e.target.value }))}
                  placeholder="AI đang chuẩn bị dàn ý..."
                />
              </div>
            </Card>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>
                <i className="fas fa-chevron-left mr-2"></i> Quay lại
              </Button>
              <Button 
                onClick={generatePrompts} 
                disabled={!config.timeline || loading} 
                loading={loading} 
                variant="success" 
                className="w-64 shadow-md"
              >
                {!hasActiveSubscription && <i className="fas fa-lock mr-1.5 text-amber-500"></i>}
                TIẾP TỤC TẠO PROMPT <i className="fas fa-rocket ml-2"></i>
              </Button>
            </div>
          </div>
        )}

        {/* STEP 4: FINAL */}
        {step === 4 && (
          <div className="space-y-10 animate-in zoom-in duration-500">
            <div className="flex flex-col md:flex-row justify-between items-center bg-white p-8 rounded-3xl border border-[#D8E2E8] shadow-xs gap-6">
               <div className="text-center md:text-left">
                 <h2 className="text-2xl font-black bg-gradient-to-r from-[#064957] via-[#05C7A5] to-[#047857] bg-clip-text text-transparent">
                   HOÀN TẤT CẤU TRÚC PROMPT & VOICE
                 </h2>
                 <p className="text-slate-500 mt-1 font-bold uppercase tracking-widest text-[9px]">
                   Đổi mới nội dung • Giữ 100% phong cách gốc • Chuẩn {numSegments} phân đoạn 8s
                 </p>
               </div>
               <div className="grid grid-cols-2 md:flex flex-wrap gap-3 w-full md:w-auto">
                 <Button onClick={copyAllPrompts} variant="outline" className="text-xs">
                   <i className={`fas ${copiedIndex === 'all-prompts' ? 'fa-check text-[#05C7A5]' : 'fa-copy'} mr-2`}></i>
                   {copiedIndex === 'all-prompts' ? 'Đã chép Prompt!' : 'Sao chép Prompts'}
                 </Button>
                 <Button onClick={copyAllVoices} variant="outline" className="text-xs">
                   <i className={`fas ${copiedIndex === 'all-voices' ? 'fa-check text-[#05C7A5]' : 'fa-copy'} mr-2`}></i>
                   {copiedIndex === 'all-voices' ? 'Đã chép Voice!' : 'Sao chép Voices'}
                 </Button>
                 <Button onClick={downloadPrompts} variant="info" className="text-xs">
                   <i className="fas fa-file-export mr-2 text-[#00D9F5]"></i> Tải file Prompt
                 </Button>
                 <Button onClick={downloadVoices} variant="success" className="text-xs">
                   <i className="fas fa-microphone mr-2"></i> Tải file Voice
                 </Button>
                 <Button onClick={() => setStep(3)} variant="outline" className="text-xs">
                   <i className="fas fa-chevron-left mr-2"></i> Quay lại
                 </Button>
               </div>
            </div>

            <div className="bg-white border border-[#D8E2E8] rounded-3xl overflow-hidden shadow-xs">
               <div className="bg-[#F3F8FA] px-8 py-5 border-b border-[#D8E2E8] flex justify-between items-center">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#064957]">
                    Bảng Phân Đoạn Video AI (8s/shot) • Phong cách: [{config.visualStyle}]
                  </span>
                  <span className="text-[10px] font-black uppercase text-[#4DD6A8] bg-[#042B22] px-3 py-1 rounded-full border border-[#05C7A5]/40 shadow-xs">
                    {numSegments} Segments x 8s = {durationSecActual}s
                  </span>
               </div>
               <div className="overflow-x-auto">
                 <table className="w-full text-left">
                    <thead>
                      <tr className="bg-[#F3F8FA]/80 text-[10px] font-black uppercase tracking-widest text-[#064957]">
                        <th className="px-6 py-5 w-16 text-center">STT</th>
                        <th className="px-6 py-5">Prompt Hình Ảnh AI (EN)</th>
                        <th className="px-6 py-5 w-1/3 border-l border-[#D8E2E8]">Lời dẫn Voice ({config.voiceLang})</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#D8E2E8]">
                      {config.prompts.map((p, i) => (
                        <tr key={i} className="group hover:bg-[#F3F8FA]/60 transition-all">
                          <td className="px-6 py-6 font-black text-2xl align-top text-center bg-gradient-to-b from-[#00D9F5] via-[#05C7A5] to-[#12D96B] bg-clip-text text-transparent">
                            {p.stt}
                          </td>
                          <td className="px-6 py-6 align-top">
                            <div className="relative group/prompt bg-[#F3F8FA] p-5 rounded-2xl border border-[#D8E2E8] text-slate-800 text-xs leading-relaxed font-medium shadow-xs group-hover:border-[#05C7A5]/60 transition-all">
                              <p>{p.prompt}</p>
                              <button
                                onClick={() => copyToClipboard(p.prompt, `prompt-${i}`)}
                                className="mt-3 text-[10px] text-slate-500 hover:text-[#05C7A5] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                              >
                                <i className={`fas ${copiedIndex === `prompt-${i}` ? 'fa-check text-[#05C7A5]' : 'fa-copy'}`}></i>
                                {copiedIndex === `prompt-${i}` ? 'Đã sao chép prompt' : 'Sao chép prompt'}
                              </button>
                            </div>
                          </td>
                          <td className="px-6 py-6 align-top border-l border-[#D8E2E8]">
                             <div className="relative group/voice bg-[#06251A]/5 p-5 rounded-2xl border border-[#05C7A5]/30 shadow-xs">
                                <p className="text-[#064957] font-semibold leading-relaxed text-sm italic">
                                  "{p.voice}"
                                </p>
                                <button
                                  onClick={() => copyToClipboard(p.voice, `voice-${i}`)}
                                  className="mt-3 text-[10px] text-slate-500 hover:text-[#05C7A5] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                                >
                                  <i className={`fas ${copiedIndex === `voice-${i}` ? 'fa-check text-[#05C7A5]' : 'fa-copy'}`}></i>
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

      {/* MODALS */}
      <PaymentModal
        isOpen={isPaymentOpen}
        onClose={() => setIsPaymentOpen(false)}
        onSuccess={(sub) => {
          setHasActiveSubscription(true);
          setSubscription(sub);
          checkSubscription();
        }}
      />

      <TrialModal
        isOpen={isTrialOpen}
        onClose={() => setIsTrialOpen(false)}
        onSuccess={(sub) => {
          setHasActiveSubscription(true);
          setSubscription(sub);
          setTrialNotice(`🎉 Kích hoạt dùng thử thành công! Chào mừng ${sub.customer_name || ''}, bạn có ${paymentConfig.trial_hours || 24} giờ sử dụng trọn bộ tính năng AI.`);
          setError(null);
          checkSubscription();
        }}
        trialConfig={{
          trial_hours: paymentConfig.trial_hours || 24,
          title: paymentConfig.trial_title || 'Dùng thử miễn phí',
          description: paymentConfig.trial_description || 'Trải nghiệm 24 giờ sử dụng trọn bộ tính năng video AI.',
          app_redirect_url: paymentConfig.trial_app_redirect_url || ''
        }}
      />

      <AdminDashboard
        isOpen={isAdminOpen}
        onClose={() => {
          setIsAdminOpen(false);
          checkSubscription();
        }}
      />

      {/* GLOBAL LOADING */}
      {loading && (
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-md z-[100] flex items-center justify-center animate-in fade-in">
          <div className="bg-white border border-slate-200 p-12 rounded-[2.5rem] shadow-2xl flex flex-col items-center max-w-sm w-full mx-4 border-t-emerald-600 border-t-4">
             <div className="relative mb-8">
               <div className="w-20 h-20 border-4 border-emerald-100 border-t-emerald-600 rounded-full animate-spin"></div>
               <div className="absolute inset-0 flex items-center justify-center">
                 <i className="fas fa-brain text-emerald-600 animate-pulse text-2xl"></i>
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
