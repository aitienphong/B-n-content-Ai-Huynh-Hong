import React, { useState } from 'react';
import { getEmailInboxUrl } from '../utils/emailHelper';

interface TrialModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (subscription: any) => void;
  trialConfig?: {
    trial_hours: number;
    title: string;
    description: string;
    app_redirect_url?: string;
  };
}

export const TrialModal: React.FC<TrialModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  trialConfig
}) => {
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [activating, setActivating] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [emailSentData, setEmailSentData] = useState<{
    token: string;
    customer_email: string;
    customer_name: string;
    activation_link: string;
    trial_hours: number;
    simulated?: boolean;
  } | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResendSuccess(false);

    if (!customerName.trim()) {
      setError('Vui lòng nhập họ và tên của bạn.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!customerEmail.trim() || !emailRegex.test(customerEmail.trim())) {
      setError('Vui lòng nhập email hợp lệ.');
      return;
    }
    if (!customerPhone.trim() || customerPhone.trim().length < 8) {
      setError('Vui lòng nhập số điện thoại liên hệ hợp lệ.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/trial/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: customerName,
          customer_email: customerEmail,
          customer_phone: customerPhone,
          device_id: navigator.userAgent
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Đăng ký dùng thử không thành công.');
      }

      setEmailSentData({
        token: data.token,
        customer_email: data.customer_email || customerEmail,
        customer_name: data.customer_name || customerName,
        activation_link: data.activation_link,
        trial_hours: data.trial_hours || trialConfig?.trial_hours || 24,
        simulated: data.simulated
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Direct activation button (for user convenience / testing)
  const handleDirectActivate = async () => {
    if (!emailSentData?.token) return;
    setActivating(true);
    setError(null);

    try {
      const res = await fetch('/api/trial/activate-by-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: emailSentData.token,
          device_id: navigator.userAgent
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Kích hoạt không thành công.');
      }

      localStorage.setItem('app_user_session', JSON.stringify({
        name: data.subscription.customer_name,
        email: data.subscription.customer_email,
        phone: data.subscription.customer_phone
      }));

      onSuccess(data.subscription);
      onClose();

      // Scroll to main workspace
      setTimeout(() => {
        const el = document.getElementById('main-workspace') || document.querySelector('main');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActivating(false);
    }
  };

  // Resend email
  const handleResend = async () => {
    if (!emailSentData?.token) return;
    setResending(true);
    setResendSuccess(false);
    setError(null);

    try {
      const res = await fetch('/api/trial/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: emailSentData.token,
          email: emailSentData.customer_email
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Không thể gửi lại email.');
      }

      setResendSuccess(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setResending(false);
    }
  };

  const getEmailDomainLink = (email: string) => {
    const domain = email.split('@')[1]?.toLowerCase() || '';
    if (domain.includes('gmail')) return 'https://mail.google.com';
    if (domain.includes('yahoo')) return 'https://mail.yahoo.com';
    if (domain.includes('outlook') || domain.includes('hotmail')) return 'https://outlook.live.com';
    return `https://${domain}`;
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-6">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-700 via-teal-700 to-green-700 px-6 sm:px-8 py-5 text-white flex items-center justify-between">
          <div>
            <span className="bg-white/20 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              Miễn phí 100%
            </span>
            <h3 className="text-lg sm:text-xl font-black mt-1">
              {emailSentData ? 'Xác nhận kích hoạt dùng thử' : (trialConfig?.title || 'Đăng ký dùng thử miễn phí')}
            </h3>
            <p className="text-emerald-100 text-xs mt-0.5">
              {emailSentData
                ? `Liên kết đã được gửi đến ${emailSentData.customer_email}`
                : `Trải nghiệm ${trialConfig?.trial_hours || 24} giờ đầy đủ tính năng tạo video AI chuyên nghiệp`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <i className="fas fa-times text-sm"></i>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 sm:p-8">
          {!emailSentData ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              
              <div className="bg-emerald-50/80 border border-emerald-200/80 p-4 rounded-2xl text-xs text-emerald-900 leading-relaxed font-medium flex items-start gap-3">
                <i className="fas fa-gift text-emerald-600 text-lg mt-0.5"></i>
                <p>
                  {trialConfig?.description || 'Điền thông tin bên dưới, hệ thống sẽ gửi liên kết kích hoạt dùng thử 24 giờ trực tiếp đến email của bạn để bắt đầu sử dụng.'}
                </p>
              </div>

              {error && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3.5 rounded-xl text-xs font-bold flex items-center gap-2">
                  <i className="fas fa-exclamation-circle"></i>
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                  Họ và tên <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Trần Văn Nam"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 outline-none focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 transition-all font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                  Địa chỉ Email nhận link kích hoạt <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="name@gmail.com"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 outline-none focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 transition-all font-semibold"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Link dùng thử sẽ được gửi đến email này để bạn kích hoạt và mở tính năng
                </span>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                  Số điện thoại <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  placeholder="0987654321"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 outline-none focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 transition-all font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                  Ghi chú (Tùy chọn)
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: Mong muốn tìm hiểu về kênh YouTube..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 outline-none focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 transition-all"
                />
              </div>

              <div className="pt-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white font-black text-sm sm:text-base shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <i className="fas fa-spinner fa-spin"></i> Đang gửi link đến email...
                    </>
                  ) : (
                    <>
                      Bắt đầu dùng thử <i className="fas fa-paper-plane text-emerald-200"></i>
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-5 animate-in zoom-in-95 duration-200">
              
              {/* Mail Icon with animated ring */}
              <div className="text-center pt-2">
                <div className="w-18 h-18 rounded-full bg-emerald-100 text-emerald-600 text-3xl flex items-center justify-center mx-auto shadow-md ring-8 ring-emerald-50">
                  <i className="fas fa-envelope-open-text"></i>
                </div>
                <h4 className="text-xl sm:text-2xl font-black text-slate-900 mt-4">
                  Đã gửi link kích hoạt đến email!
                </h4>
                <p className="text-slate-600 text-xs sm:text-sm mt-1.5">
                  Hệ thống đã gửi liên kết dùng thử <strong>{emailSentData.trial_hours} giờ</strong> đến địa chỉ:
                </p>
                <div className="mt-2 inline-block bg-emerald-50 border border-emerald-300 text-emerald-900 font-mono font-bold text-xs sm:text-sm px-4 py-1.5 rounded-xl shadow-xs">
                  {emailSentData.customer_email}
                </div>
              </div>

              {/* Instructions Box / Simulation Warning */}
              {emailSentData.simulated ? (
                <div className="bg-amber-50/90 border border-amber-300 text-amber-950 rounded-2xl p-4 text-xs space-y-2.5">
                  <div className="font-bold flex items-center gap-2 text-amber-900 text-sm">
                    <i className="fas fa-exclamation-triangle text-amber-600"></i>
                    Máy chủ chưa cài đặt Email SMTP (Chế độ Thử Nghiệm)
                  </div>
                  <p className="text-slate-700 leading-relaxed text-xs">
                    Để email gửi tự động vào hộp thư <strong>{emailSentData.customer_email}</strong>, quản trị viên cần điền <em>Tài khoản &amp; Mật khẩu ứng dụng SMTP</em> trong mục <strong>Admin &gt; Cấu hình Email</strong>.
                  </p>
                  <p className="text-slate-700 leading-relaxed text-xs">
                    Hệ thống đã tạo sẵn đường link kích hoạt <strong>{emailSentData.trial_hours} giờ</strong> cho tài khoản của bạn. Bạn có thể nhấn <strong>Kích hoạt dùng thử ngay</strong> bên dưới hoặc sao chép link:
                  </p>
                  {emailSentData.activation_link && (
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        readOnly
                        value={emailSentData.activation_link}
                        className="flex-1 bg-white border border-amber-300 rounded-xl px-3 py-2 text-[11px] font-mono text-slate-700 select-all"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (emailSentData.activation_link) {
                            navigator.clipboard.writeText(emailSentData.activation_link);
                            setCopiedLink(true);
                            setTimeout(() => setCopiedLink(false), 2500);
                          }
                        }}
                        className="px-3 py-2 rounded-xl bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold text-xs transition-colors whitespace-nowrap cursor-pointer shadow-xs"
                      >
                        {copiedLink ? <><i className="fas fa-check text-emerald-600 mr-1"></i> Đã chép</> : <><i className="fas fa-copy mr-1"></i> Chép link</>}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs space-y-2.5 text-slate-700">
                  <div className="font-bold text-slate-900 flex items-center gap-2">
                    <i className="fas fa-info-circle text-emerald-600"></i>
                    Cách mở tính năng dùng thử:
                  </div>
                  <ol className="list-decimal pl-5 space-y-1.5 leading-relaxed text-slate-600">
                    <li>Mở ứng dụng email của bạn (kiểm tra cả mục <strong>Thư rác / Spam</strong> nếu chưa thấy).</li>
                    <li>Tìm email có tiêu đề: <span className="font-semibold text-slate-800">[Kích hoạt] Trải nghiệm miễn phí {emailSentData.trial_hours}h công nghệ AI Video</span>.</li>
                    <li>Bấm vào nút <strong>"Bắt đầu dùng thử ngay"</strong> trong email để kích hoạt tài khoản và mở khóa toàn bộ tính năng.</li>
                  </ol>
                </div>
              )}

              {resendSuccess && (
                <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 p-3 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
                  <i className="fas fa-check-circle text-emerald-600"></i>
                  Đã gửi lại link kích hoạt thành công đến email của bạn!
                </div>
              )}

              {error && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3.5 rounded-xl text-xs font-bold flex items-center gap-2">
                  <i className="fas fa-exclamation-circle"></i>
                  {error}
                </div>
              )}

              {/* Actions */}
              <div className="space-y-2.5 pt-2">
                {emailSentData.simulated ? (
                  <>
                    {/* Primary Button in Simulation Mode: Direct Activate */}
                    <button
                      type="button"
                      onClick={handleDirectActivate}
                      disabled={activating}
                      className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {activating ? (
                        <>
                          <i className="fas fa-spinner fa-spin"></i> Đang kích hoạt tài khoản...
                        </>
                      ) : (
                        <>
                          <i className="fas fa-bolt text-amber-300"></i> Kích hoạt dùng thử ngay (Bắt đầu 24h)
                        </>
                      )}
                    </button>

                    <a
                      href={getEmailInboxUrl(emailSentData.customer_email)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <i className="fas fa-external-link-alt text-xs text-blue-600"></i>
                      Mở hộp thư Email ({emailSentData.customer_email})
                    </a>
                  </>
                ) : (
                  <>
                    {/* Primary Button in Real SMTP Mode: Open Email */}
                    <a
                      href={getEmailInboxUrl(emailSentData.customer_email)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <i className="fas fa-external-link-alt text-xs"></i>
                      Mở hộp thư Email ngay
                    </a>

                    {/* Direct quick activate button (convenience fallback) */}
                    <button
                      type="button"
                      onClick={handleDirectActivate}
                      disabled={activating}
                      className="w-full py-3 rounded-2xl bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 border border-slate-200 text-slate-700 font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {activating ? (
                        <>
                          <i className="fas fa-spinner fa-spin"></i> Đang kích hoạt...
                        </>
                      ) : (
                        <>
                          <i className="fas fa-bolt text-amber-500"></i> Kích hoạt ngay tại trình duyệt này (Thử nghiệm nhanh)
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>

              {/* Resend link */}
              <div className="text-center pt-1 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resending}
                  className="text-xs text-slate-500 hover:text-emerald-700 font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {resending ? (
                    <i className="fas fa-spinner fa-spin"></i>
                  ) : (
                    <i className="fas fa-redo-alt text-[10px]"></i>
                  )}
                  Chưa nhận được thư? Nhấn vào đây để gửi lại
                </button>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
};
