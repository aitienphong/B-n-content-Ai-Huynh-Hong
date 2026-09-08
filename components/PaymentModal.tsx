import React, { useState, useEffect, useRef } from 'react';
import { getEmailInboxUrl } from '../utils/emailHelper';

interface Plan {
  id: string;
  name: string;
  description: string;
  price: number;
  days: number;
  is_active: number;
  is_featured: number;
}

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (subscription: any) => void;
  initialCustomer?: { name: string; email: string; phone: string };
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialCustomer
}) => {
  const [step, setStep] = useState<number>(1);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);

  // Form states
  const [customerName, setCustomerName] = useState(initialCustomer?.name || '');
  const [customerEmail, setCustomerEmail] = useState(initialCustomer?.email || '');
  const [customerPhone, setCustomerPhone] = useState(initialCustomer?.phone || '');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Order & Payment state
  const [order, setOrder] = useState<any>(null);
  const [paymentInfo, setPaymentInfo] = useState<any>(null);
  const [copiedBankAcc, setCopiedBankAcc] = useState(false);
  const [copiedContent, setCopiedContent] = useState(false);
  const [orderStatus, setOrderStatus] = useState<string>('pending');
  const [activatedSubscription, setActivatedSubscription] = useState<any>(null);

  const pollIntervalRef = useRef<any>(null);

  // Fetch plans on open
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setFormError(null);
      fetch('/api/plans')
        .then(res => res.json())
        .then(data => {
          if (data.plans && data.plans.length > 0) {
            setPlans(data.plans);
            const featured = data.plans.find((p: Plan) => p.is_featured) || data.plans[0];
            setSelectedPlan(featured);
          }
        })
        .catch(err => console.error('Fetch plans error:', err));
    } else {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    }
  }, [isOpen]);

  // Polling order status in Step 3
  useEffect(() => {
    if (step === 3 && order?.order_code) {
      pollIntervalRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/orders/${order.order_code}/status`);
          const data = await res.json();
          if (data.success) {
            setOrderStatus(data.status);
            if (data.status === 'paid') {
              clearInterval(pollIntervalRef.current);
              setActivatedSubscription(data.subscription || { plan_name: order.plan_name });
              // Save user session
              localStorage.setItem('app_user_session', JSON.stringify({
                name: order.customer_name,
                email: order.customer_email,
                phone: order.customer_phone
              }));
              setStep(4);
              onSuccess(data.subscription);
            }
          }
        } catch (err) {
          console.warn('Poll error:', err);
        }
      }, 4000);

      return () => {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      };
    }
  }, [step, order, onSuccess]);

  if (!isOpen) return null;

  const handleSelectPlan = (p: Plan) => {
    setSelectedPlan(p);
    setStep(2);
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!selectedPlan) {
      setFormError('Vui lòng chọn một gói sử dụng.');
      setStep(1);
      return;
    }
    if (!customerName.trim()) {
      setFormError('Vui lòng nhập họ và tên.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!customerEmail.trim() || !emailRegex.test(customerEmail.trim())) {
      setFormError('Vui lòng nhập email chính xác.');
      return;
    }
    if (!customerPhone.trim() || customerPhone.trim().length < 8) {
      setFormError('Vui lòng nhập số điện thoại liên hệ hợp lệ.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_id: selectedPlan.id,
          customer_name: customerName,
          customer_email: customerEmail,
          customer_phone: customerPhone,
          note
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Không thể tạo đơn hàng.');
      }

      setOrder(data.order);
      setPaymentInfo(data.payment_info);
      setStep(3);
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, type: 'acc' | 'content') => {
    navigator.clipboard.writeText(text);
    if (type === 'acc') {
      setCopiedBankAcc(true);
      setTimeout(() => setCopiedBankAcc(false), 2000);
    } else {
      setCopiedContent(true);
      setTimeout(() => setCopiedContent(false), 2000);
    }
  };

  const formatPrice = (val: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-6">
        
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-sky-700 px-6 sm:px-8 py-5 text-white flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-white/20 text-white text-[11px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                Bước {step}/4
              </span>
              <h3 className="text-lg sm:text-xl font-black">
                {step === 1 && 'Chọn Gói Sử Dụng'}
                {step === 2 && 'Nhập Thông Tin Khách Hàng'}
                {step === 3 && 'Quét QR Thanh Toán SePay'}
                {step === 4 && 'Kích Hoạt Thành Công!'}
              </h3>
            </div>
            <p className="text-blue-100 text-xs mt-1">
              Thanh toán tự động 24/7 qua SePay • Kích hoạt ngay lập tức
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
          >
            <i className="fas fa-times text-sm"></i>
          </button>
        </div>

        {/* Progress Dots */}
        <div className="grid grid-cols-4 bg-slate-100 border-b border-slate-200 text-center py-2.5 px-4 text-[11px] font-bold">
          <div className={step >= 1 ? 'text-blue-700' : 'text-slate-400'}>
            <i className="fas fa-cube mr-1"></i> 1. Chọn gói
          </div>
          <div className={step >= 2 ? 'text-blue-700' : 'text-slate-400'}>
            <i className="fas fa-user-edit mr-1"></i> 2. Thông tin
          </div>
          <div className={step >= 3 ? 'text-blue-700' : 'text-slate-400'}>
            <i className="fas fa-qrcode mr-1"></i> 3. Quét QR
          </div>
          <div className={step >= 4 ? 'text-emerald-700' : 'text-slate-400'}>
            <i className="fas fa-check-circle mr-1"></i> 4. Hoàn tất
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 sm:p-8">

          {/* STEP 1: CHỌN GÓI */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="text-center max-w-md mx-auto">
                <h4 className="text-xl font-black text-slate-900">Mở Khóa Toàn Bộ Sức Mạnh Video AI</h4>
                <p className="text-xs text-slate-500 mt-1">
                  Chọn gói bản quyền để sử dụng không giới hạn tất cả các tính năng sáng tạo nội dung.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {plans.map(p => {
                  const isSelected = selectedPlan?.id === p.id;
                  return (
                    <div
                      key={p.id}
                      onClick={() => setSelectedPlan(p)}
                      className={`relative p-6 rounded-2xl border-2 transition-all cursor-pointer flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/50 shadow-md ring-2 ring-blue-500/20'
                          : 'border-slate-200 hover:border-blue-300 bg-white'
                      }`}
                    >
                      {p.is_featured === 1 && (
                        <span className="absolute -top-3 left-6 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[10px] font-black uppercase tracking-wider px-3 py-0.5 rounded-full shadow-sm">
                          Gói Nổi Bật Nhất
                        </span>
                      )}
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h5 className="text-lg font-black text-slate-900">{p.name}</h5>
                          <span className="text-[11px] font-bold text-blue-700 bg-blue-100 px-2.5 py-0.5 rounded-md">
                            {p.days >= 36500 ? 'Vĩnh viễn' : `${p.days} ngày`}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                          {p.description || 'Đầy đủ kịch bản, dàn ý timeline, âm thanh và bảng prompts.'}
                        </p>
                      </div>
                      <div className="text-left sm:text-right w-full sm:w-auto flex sm:flex-col items-center sm:items-end justify-between border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100">
                        <div className="text-2xl font-black text-blue-700">
                          {formatPrice(p.price)}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectPlan(p);
                          }}
                          className="mt-2 px-5 py-2 rounded-xl text-xs font-black bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all"
                        >
                          Chọn gói <i className="fas fa-arrow-right ml-1"></i>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-end pt-4 border-t border-slate-100">
                <button
                  type="button"
                  disabled={!selectedPlan}
                  onClick={() => setStep(2)}
                  className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-black text-sm shadow-md transition-all flex items-center gap-2"
                >
                  Tiếp Tục Nhập Thông Tin <i className="fas fa-arrow-right"></i>
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: NHẬP THÔNG TIN */}
          {step === 2 && (
            <form onSubmit={handleCreateOrder} className="space-y-5">
              <div className="bg-blue-50 border border-blue-200/80 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase text-blue-600 tracking-wider">Gói đã chọn</span>
                  <h5 className="font-black text-slate-900 text-sm">{selectedPlan?.name}</h5>
                </div>
                <div className="text-right">
                  <span className="text-lg font-black text-blue-700">
                    {selectedPlan ? formatPrice(selectedPlan.price) : ''}
                  </span>
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="block text-[11px] text-blue-600 underline font-bold"
                  >
                    Đổi gói khác
                  </button>
                </div>
              </div>

              {formError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3.5 rounded-xl text-xs font-bold flex items-center gap-2">
                  <i className="fas fa-exclamation-circle"></i>
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                  Họ và tên khách hàng <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Nguyễn Văn A"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 outline-none focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition-all font-semibold"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                    Địa chỉ Email <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="name@gmail.com"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 outline-none focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition-all font-semibold"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Dùng để lưu trữ và kích hoạt bản quyền
                  </span>
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                    Số điện thoại <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="0912345678"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 outline-none focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition-all font-semibold"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Hỗ trợ xác nhận giao dịch khi cần
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                  Ghi chú đơn hàng (Tùy chọn)
                </label>
                <textarea
                  rows={2}
                  placeholder="Ghi chú thêm nếu có..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 outline-none focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition-all"
                />
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50"
                >
                  <i className="fas fa-chevron-left mr-1"></i> Quay lại
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-7 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-black text-sm shadow-md transition-all flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <i className="fas fa-spinner fa-spin"></i> Đang tạo đơn...
                    </>
                  ) : (
                    <>
                      Tiếp Tục Thanh Toán <i className="fas fa-qrcode"></i>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* STEP 3: QUÉT QR THANH TOÁN */}
          {step === 3 && order && paymentInfo && (
            <div className="space-y-6">
              <div className="text-center">
                <h4 className="text-xl font-black text-slate-900">Quét QR để thanh toán</h4>
                <div className="inline-flex items-center gap-2 mt-1 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold animate-pulse">
                  <i className="fas fa-spinner fa-spin text-amber-600"></i>
                  Đang kiểm tra thanh toán tự động...
                </div>
              </div>

              {/* Responsive Layout: Desktop QR left, info right. Mobile: QR top, info bottom */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 bg-slate-50/80 p-6 rounded-3xl border border-slate-200">
                
                {/* QR Code Column */}
                <div className="md:col-span-5 flex flex-col items-center justify-center bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="w-52 h-52 sm:w-56 sm:h-56 relative flex items-center justify-center rounded-xl overflow-hidden bg-white border border-slate-100 p-2">
                    <img
                      src={paymentInfo.qr_url}
                      alt="VietQR SePay"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <span className="text-[11px] font-bold text-slate-500 mt-2 text-center">
                    Mở App Ngân hàng bất kỳ để quét mã
                  </span>
                </div>

                {/* Bank Details Column */}
                <div className="md:col-span-7 space-y-3 flex flex-col justify-center">
                  
                  {/* Amount */}
                  <div className="bg-blue-50/80 border border-blue-200/90 p-3.5 rounded-xl flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-600">Số tiền cần chuyển:</span>
                    <span className="text-xl font-black text-blue-700">
                      {formatPrice(paymentInfo.amount)}
                    </span>
                  </div>

                  {/* Bank Name */}
                  <div className="p-3 bg-white rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-bold">Ngân hàng:</span>
                    <span className="font-black text-slate-800">{paymentInfo.bank_name}</span>
                  </div>

                  {/* Account Number with Copy */}
                  <div className="p-3 bg-white rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-bold">Số tài khoản:</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-slate-900 text-sm">
                        {paymentInfo.account_number}
                      </span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(paymentInfo.account_number, 'acc')}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-blue-600 font-bold text-[11px] transition-colors"
                      >
                        {copiedBankAcc ? <><i className="fas fa-check text-emerald-600"></i> Đã chép</> : 'Copy'}
                      </button>
                    </div>
                  </div>

                  {/* Account Holder */}
                  <div className="p-3 bg-white rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-bold">Chủ tài khoản:</span>
                    <span className="font-black text-slate-800 uppercase">{paymentInfo.account_holder}</span>
                  </div>

                  {/* Payment Content (Order Code) with Copy */}
                  <div className="p-3 bg-amber-50/90 rounded-xl border border-amber-300 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-amber-900 font-bold block">Nội dung chuyển khoản:</span>
                      <span className="font-mono font-black text-amber-900 text-base">
                        {paymentInfo.payment_content}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(paymentInfo.payment_content, 'content')}
                      className="px-3 py-1.5 rounded-lg bg-amber-200 hover:bg-amber-300 text-amber-950 font-black text-xs transition-colors shadow-xs"
                    >
                      {copiedContent ? <><i className="fas fa-check text-emerald-700"></i> Đã chép</> : 'Copy mã'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Important Note */}
              <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 text-amber-900 text-xs font-medium flex items-start gap-3">
                <i className="fas fa-info-circle text-amber-600 text-base mt-0.5"></i>
                <p>
                  <strong>Lưu ý quan trọng:</strong> Vui lòng chuyển đúng số tiền và đúng nội dung (
                  <span className="font-mono font-bold text-blue-700">{paymentInfo.payment_content}</span>
                  ) để hệ thống tự xác nhận và kích hoạt tài khoản của bạn ngay lập tức!
                </p>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50"
                >
                  <i className="fas fa-chevron-left mr-1"></i> Sửa thông tin
                </button>
                <div className="text-right">
                  <span className="text-[11px] text-slate-400 block font-medium">
                    Mã đơn hàng: <strong className="text-slate-700">{order.order_code}</strong>
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: KÍCH HOẠT THÀNH CÔNG */}
          {step === 4 && (
            <div className="text-center py-6 space-y-6 animate-in zoom-in duration-300">
              <div className="w-20 h-20 rounded-full bg-emerald-100 text-emerald-600 text-4xl flex items-center justify-center mx-auto shadow-lg ring-8 ring-emerald-50">
                <i className="fas fa-check"></i>
              </div>

              <div>
                <h4 className="text-2xl font-black text-slate-900">Thanh toán thành công!</h4>
                <p className="text-slate-600 text-sm mt-2 max-w-md mx-auto">
                  Chúc mừng bạn! Gói <strong className="text-blue-700">{order?.plan_name || 'Vĩnh Viễn'}</strong> đã được kích hoạt thành công cho tài khoản <strong>{order?.customer_email}</strong>.
                </p>
                <div className="mt-4 inline-block bg-emerald-50 border border-emerald-200 px-5 py-2 rounded-xl text-emerald-800 text-xs font-black">
                  {order?.plan_days >= 36500 ? (
                    <>Gói của bạn đã được kích hoạt: Vĩnh Viễn Không Giới Hạn</>
                  ) : (
                    <>
                      Gói của bạn đã được kích hoạt đến ngày{' '}
                      {new Date(Date.now() + (order?.plan_days || 30) * 24 * 60 * 60 * 1000).toLocaleDateString('vi-VN')}
                    </>
                  )}
                </div>
              </div>

              <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
                <a
                  href={getEmailInboxUrl(order?.customer_email || customerEmail)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 font-bold text-sm shadow-sm transition-all inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <i className="fas fa-external-link-alt text-xs text-blue-600"></i>
                  Mở hộp thư Email ngay
                </a>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-sm shadow-lg hover:shadow-xl transition-all"
                >
                  Bắt đầu sử dụng <i className="fas fa-rocket ml-2"></i>
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
