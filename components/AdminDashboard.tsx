import React, { useState, useEffect } from 'react';

interface AdminDashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'overview' | 'plans' | 'sepay' | 'trial' | 'email' | 'orders' | 'webhooks' | 'active_users' | 'trial_users';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ isOpen, onClose }) => {
  const [passcode, setPasscode] = useState(localStorage.getItem('admin_passcode') || '');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Tab Data States
  const [stats, setStats] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [editingPlan, setEditingPlan] = useState<any>(null);
  const [sepaySettings, setSepaySettings] = useState<any>({
    bank_name: '',
    bank_code: '',
    account_number: '',
    account_holder: '',
    api_key: '',
    webhook_secret: '',
    order_prefix: 'AFF',
    payment_content_template: '{order_code}',
    webhook_url: '/api/sepay-webhook',
    is_active: 1
  });
  const [trialSettings, setTrialSettings] = useState<any>({
    is_active: 1,
    trial_hours: 24,
    button_title: 'Dùng thử miễn phí',
    description: '',
    terms: '',
    max_per_email: 1,
    max_per_phone: 1
  });
  const [emailSettings, setEmailSettings] = useState<any>({
    smtp_host: 'smtp.gmail.com',
    smtp_port: 587,
    smtp_user: '',
    smtp_pass: '',
    from_name: 'AI Video Công Nghệ',
    from_email: '',
    is_active: 1
  });
  const [sentEmails, setSentEmails] = useState<any[]>([]);
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [testingEmail, setTestingEmail] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [webhookLogs, setWebhookLogs] = useState<any[]>([]);
  const [activeUsers, setActiveUsers] = useState<any[]>([]);
  const [trialUsers, setTrialUsers] = useState<any[]>([]);
  const [trialFilter, setTrialFilter] = useState<'all' | 'active' | 'expired' | 'upgraded'>('all');
  const [testOrderCode, setTestOrderCode] = useState('');

  // Check login on load
  useEffect(() => {
    if (isOpen) {
      const pin = passcode || localStorage.getItem('admin_passcode') || 'aitienphong';
      handleLogin(pin);
    }
  }, [isOpen]);

  const showToast = (msg: string, isError = false) => {
    if (isError) {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(null), 4000);
    } else {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(null), 3000);
    }
  };

  const handleLogin = async (pinToTest?: string) => {
    const pin = pinToTest || passcode;
    setLoading(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: pin })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Mã xác thực không hợp lệ');
      }
      setIsAuthenticated(true);
      localStorage.setItem('admin_passcode', pin);
      loadTabData(activeTab, pin);
    } catch (err: any) {
      setIsAuthenticated(false);
      showToast(err.message, true);
    } finally {
      setLoading(false);
    }
  };

  const loadTabData = async (tab: TabType, currentPin = passcode) => {
    setLoading(true);
    const headers = { 'x-admin-passcode': currentPin };

    try {
      if (tab === 'overview') {
        const res = await fetch('/api/admin/overview', { headers });
        const data = await res.json();
        if (data.success) setStats(data.stats);
      } else if (tab === 'plans') {
        const res = await fetch('/api/admin/plans', { headers });
        const data = await res.json();
        if (data.success) setPlans(data.plans);
      } else if (tab === 'sepay') {
        const res = await fetch('/api/admin/sepay-settings', { headers });
        const data = await res.json();
        if (data.success) setSepaySettings(data.settings);
      } else if (tab === 'trial') {
        const res = await fetch('/api/admin/trial-settings', { headers });
        const data = await res.json();
        if (data.success) setTrialSettings(data.settings);
      } else if (tab === 'email') {
        const res = await fetch('/api/admin/email-settings', { headers });
        const data = await res.json();
        if (data.success) setEmailSettings(data.settings);

        const resLogs = await fetch('/api/admin/sent-emails', { headers });
        const dataLogs = await resLogs.json();
        if (dataLogs.success) setSentEmails(dataLogs.emails);
      } else if (tab === 'orders') {
        const res = await fetch('/api/admin/orders', { headers });
        const data = await res.json();
        if (data.success) setOrders(data.orders);
      } else if (tab === 'webhooks') {
        const res = await fetch('/api/admin/webhook-logs', { headers });
        const data = await res.json();
        if (data.success) setWebhookLogs(data.logs);
      } else if (tab === 'active_users') {
        const res = await fetch('/api/admin/active-users', { headers });
        const data = await res.json();
        if (data.success) setActiveUsers(data.users);
      } else if (tab === 'trial_users') {
        const res = await fetch(`/api/admin/trial-users?filter=${trialFilter}`, { headers });
        const data = await res.json();
        if (data.success) setTrialUsers(data.trialUsers);
      }
    } catch (err: any) {
      showToast('Lỗi tải dữ liệu: ' + err.message, true);
    } finally {
      setLoading(false);
    }
  };

  const switchTab = (tab: TabType) => {
    setActiveTab(tab);
    loadTabData(tab);
  };

  const handleSaveSepay = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/admin/sepay-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-passcode': passcode },
        body: JSON.stringify(sepaySettings)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error);
      showToast('Đã lưu cấu hình SePay thành công!');
    } catch (err: any) {
      showToast(err.message, true);
    } finally {
      setLoading(false);
    }
  };

  const handleTestSepay = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/sepay-test', {
        method: 'POST',
        headers: { 'x-admin-passcode': passcode }
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || data.error);
      showToast(data.message);
    } catch (err: any) {
      showToast(err.message, true);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateMockTransaction = async () => {
    if (!testOrderCode.trim()) {
      showToast('Vui lòng nhập mã đơn hàng cần test (Ví dụ: AFF000001)', true);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/admin/sepay-test-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-passcode': passcode },
        body: JSON.stringify({ order_code: testOrderCode.trim().toUpperCase() })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error);
      showToast(data.message);
      setTestOrderCode('');
      loadTabData(activeTab);
    } catch (err: any) {
      showToast(err.message, true);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTrial = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/admin/trial-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-passcode': passcode },
        body: JSON.stringify(trialSettings)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error);
      showToast('Đã lưu cấu hình Dùng thử thành công!');
    } catch (err: any) {
      showToast(err.message, true);
    } finally {
      setLoading(false);
    }
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan) return;
    setLoading(true);
    try {
      const res = await fetch('/api/admin/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-passcode': passcode },
        body: JSON.stringify(editingPlan)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error);
      showToast('Đã cập nhật gói thành công!');
      setEditingPlan(null);
      loadTabData('plans');
    } catch (err: any) {
      showToast(err.message, true);
    } finally {
      setLoading(false);
    }
  };

  const copyWebhookUrl = () => {
    const fullUrl = `${window.location.origin}/api/sepay-webhook`;
    navigator.clipboard.writeText(fullUrl);
    showToast(`Đã chép Webhook URL: ${fullUrl}`);
  };

  const handleClearData = async (target: 'all' | 'trials' = 'all') => {
    const confirmMsg = target === 'trials'
      ? 'Bạn có chắc chắn muốn xóa toàn bộ thông tin đăng ký dùng thử để có thể test đăng ký lại từ đầu?'
      : 'CẢNH BÁO: Thao tác này sẽ xóa toàn bộ danh sách khách hàng, đơn hàng, gói dùng thử và email để bạn bắt đầu test lại như mới. Bạn có chắc chắn không?';

    if (!window.confirm(confirmMsg)) return;

    setLoading(true);
    try {
      const res = await fetch('/api/admin/clear-test-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-passcode': passcode
        },
        body: JSON.stringify({ target })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Xóa thất bại');
      showToast(data.message || 'Đã xóa dữ liệu thành công!');
      loadTabData(activeTab);
    } catch (err: any) {
      showToast(err.message, true);
    } finally {
      setLoading(false);
    }
  };

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);
  };

  const formatDate = (iso: string) => {
    if (!iso) return '-';
    try {
      const d = new Date(iso);
      return `${d.toLocaleDateString('vi-VN')} ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return iso;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#031A12]/80 backdrop-blur-md p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-200 font-['Plus_Jakarta_Sans',sans-serif]">
      <div className="relative w-full max-w-6xl bg-[#FCFDFC] rounded-3xl shadow-[0_25px_60px_rgba(0,0,0,0.5)] border border-[#D8E2E8] overflow-hidden flex flex-col max-h-[95vh] my-auto">
        
        {/* Top Header: Thanh đầu trang: xanh đen pha lục #06251A có viền xanh lá */}
        <div className="bg-[#06251A] text-white px-6 py-4 flex items-center justify-between border-b border-[#12D96B]/30 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#064957] border border-[#00D9F5]/40 flex items-center justify-center text-[#00D9F5] shadow-[0_0_10px_rgba(0,217,245,0.2)]">
              <i className="fas fa-shield-alt text-lg"></i>
            </div>
            <div>
              <h3 className="font-black text-base sm:text-lg flex items-center gap-2 text-white">
                Hệ Thống Quản Trị SePay & Gói Dùng
                <span className="text-[10px] bg-[#042B22] text-[#4DD6A8] border border-[#05C7A5]/50 px-2 py-0.5 rounded-full font-mono">
                  ADMIN v2.0
                </span>
              </h3>
              <p className="text-[#4DD6A8]/70 text-xs">Quản lý thanh toán, kích hoạt gói tự động và người dùng</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#042B22] text-[#05C7A5] hover:text-[#00D9F5] border border-[#05C7A5]/50 flex items-center justify-center transition-colors cursor-pointer"
          >
            <i className="fas fa-times text-sm"></i>
          </button>
        </div>

        {/* Toast Notifications */}
        {errorMsg && (
          <div className="bg-rose-500 text-white text-xs font-bold px-6 py-2.5 flex items-center justify-between shrink-0 animate-in slide-in-from-top duration-200">
            <span><i className="fas fa-exclamation-circle mr-2"></i>{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)}><i className="fas fa-times"></i></button>
          </div>
        )}
        {successMsg && (
          <div className="bg-emerald-600 text-white text-xs font-bold px-6 py-2.5 flex items-center justify-between shrink-0 animate-in slide-in-from-top duration-200">
            <span><i className="fas fa-check-circle mr-2"></i>{successMsg}</span>
            <button onClick={() => setSuccessMsg(null)}><i className="fas fa-times"></i></button>
          </div>
        )}

        {/* Body Content */}
        {!isAuthenticated ? (
          /* Login Form */
          <div className="p-8 sm:p-12 max-w-md mx-auto w-full text-center space-y-6 my-auto">
            <div className="w-16 h-16 rounded-2xl bg-[#064957] text-[#00D9F5] border-2 border-[#00D9F5] flex items-center justify-center text-3xl mx-auto shadow-[0_0_14px_rgba(0,217,245,0.25)]">
              <i className="fas fa-lock"></i>
            </div>
            <div>
              <h4 className="text-xl font-black text-[#031A12]">Xác Thực Quản Trị Viên</h4>
              <p className="text-xs text-slate-500 mt-1">
                Nhập mật khẩu Quản trị viên (aitienphong)
              </p>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); handleLogin(); }} className="space-y-4">
              <input
                type="password"
                placeholder="Nhập mật khẩu (aitienphong)..."
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                className="w-full bg-white border border-[#D8E2E8] rounded-2xl px-4 py-3 text-center text-lg font-mono tracking-widest text-[#031A12] outline-none focus:border-[#05C7A5] focus:ring-2 focus:ring-[#05C7A5]/20 transition-all font-bold"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-2xl bg-[#064957] hover:bg-[#085a6b] text-white border-2 border-[#00D9F5] font-black text-sm shadow-[0_0_14px_rgba(0,217,245,0.25)] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {loading ? <i className="fas fa-spinner fa-spin text-[#00D9F5]"></i> : <i className="fas fa-key text-[#00D9F5]"></i>}
                Đăng Nhập Quản Trị
              </button>
            </form>
          </div>
        ) : (
          /* Admin Main Screen with Tabs */
          <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
            
            {/* Sidebar Navigation */}
            <div className="w-full md:w-64 bg-[#06251A] border-r border-[#12D96B]/20 p-3 flex md:flex-col gap-1 overflow-x-auto md:overflow-y-auto shrink-0">
              <button
                onClick={() => switchTab('overview')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left whitespace-nowrap cursor-pointer ${
                  activeTab === 'overview' ? 'bg-[#064957] text-[#00D9F5] border border-[#00D9F5]/40 shadow-[0_0_10px_rgba(0,217,245,0.2)]' : 'text-[#4DD6A8]/70 hover:text-white hover:bg-[#042B22]'
                }`}
              >
                <i className="fas fa-chart-line w-4 text-center"></i> Tổng quan
              </button>
              <button
                onClick={() => switchTab('plans')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left whitespace-nowrap cursor-pointer ${
                  activeTab === 'plans' ? 'bg-[#064957] text-[#00D9F5] border border-[#00D9F5]/40 shadow-[0_0_10px_rgba(0,217,245,0.2)]' : 'text-[#4DD6A8]/70 hover:text-white hover:bg-[#042B22]'
                }`}
              >
                <i className="fas fa-cubes w-4 text-center"></i> Gói sử dụng
              </button>
              <button
                onClick={() => switchTab('sepay')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left whitespace-nowrap cursor-pointer ${
                  activeTab === 'sepay' ? 'bg-[#064957] text-[#00D9F5] border border-[#00D9F5]/40 shadow-[0_0_10px_rgba(0,217,245,0.2)]' : 'text-[#4DD6A8]/70 hover:text-white hover:bg-[#042B22]'
                }`}
              >
                <i className="fas fa-wallet w-4 text-center"></i> Cài đặt SePay
              </button>
              <button
                onClick={() => switchTab('trial')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left whitespace-nowrap cursor-pointer ${
                  activeTab === 'trial' ? 'bg-[#064957] text-[#00D9F5] border border-[#00D9F5]/40 shadow-[0_0_10px_rgba(0,217,245,0.2)]' : 'text-[#4DD6A8]/70 hover:text-white hover:bg-[#042B22]'
                }`}
              >
                <i className="fas fa-clock w-4 text-center"></i> Cài đặt Dùng thử
              </button>
              <button
                onClick={() => switchTab('email')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left whitespace-nowrap cursor-pointer ${
                  activeTab === 'email' ? 'bg-[#064957] text-[#00D9F5] border border-[#00D9F5]/40 shadow-[0_0_10px_rgba(0,217,245,0.2)]' : 'text-[#4DD6A8]/70 hover:text-white hover:bg-[#042B22]'
                }`}
              >
                <i className="fas fa-envelope w-4 text-center"></i> Cấu hình Email SMTP
              </button>
              <button
                onClick={() => switchTab('orders')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left whitespace-nowrap cursor-pointer ${
                  activeTab === 'orders' ? 'bg-[#064957] text-[#00D9F5] border border-[#00D9F5]/40 shadow-[0_0_10px_rgba(0,217,245,0.2)]' : 'text-[#4DD6A8]/70 hover:text-white hover:bg-[#042B22]'
                }`}
              >
                <i className="fas fa-receipt w-4 text-center"></i> Đơn hàng
              </button>
              <button
                onClick={() => switchTab('webhooks')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left whitespace-nowrap cursor-pointer ${
                  activeTab === 'webhooks' ? 'bg-[#064957] text-[#00D9F5] border border-[#00D9F5]/40 shadow-[0_0_10px_rgba(0,217,245,0.2)]' : 'text-[#4DD6A8]/70 hover:text-white hover:bg-[#042B22]'
                }`}
              >
                <i className="fas fa-bolt w-4 text-center"></i> Webhook Logs
              </button>
              <button
                onClick={() => switchTab('active_users')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left whitespace-nowrap cursor-pointer ${
                  activeTab === 'active_users' ? 'bg-[#064957] text-[#00D9F5] border border-[#00D9F5]/40 shadow-[0_0_10px_rgba(0,217,245,0.2)]' : 'text-[#4DD6A8]/70 hover:text-white hover:bg-[#042B22]'
                }`}
              >
                <i className="fas fa-users-cog w-4 text-center"></i> Người dùng Active
              </button>
              <button
                onClick={() => switchTab('trial_users')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left whitespace-nowrap ${
                  activeTab === 'trial_users' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <i className="fas fa-user-clock w-4 text-center"></i> Dùng thử & Thiết bị
              </button>

              <div className="mt-auto pt-4 border-t border-slate-800 hidden md:block space-y-1">
                <button
                  onClick={() => handleClearData('all')}
                  className="w-full text-left text-xs font-bold text-amber-400 hover:text-amber-300 p-2.5 rounded-xl hover:bg-amber-500/10 flex items-center gap-2 cursor-pointer transition-colors"
                  title="Xóa toàn bộ khách hàng và đơn hàng để test lại"
                >
                  <i className="fas fa-trash-restore text-xs"></i> Xóa dữ liệu để test lại
                </button>
                <button
                  onClick={() => setIsAuthenticated(false)}
                  className="w-full text-left text-xs font-bold text-rose-400 hover:text-rose-300 p-2.5 rounded-xl hover:bg-rose-500/10 flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <i className="fas fa-sign-out-alt"></i> Đăng xuất Admin
                </button>
              </div>
            </div>

            {/* Main Tab Area */}
            <div className="flex-1 p-6 overflow-y-auto bg-slate-50/50">
              
              {/* TAB 1: OVERVIEW */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xl font-black text-slate-900">Báo Cáo Hoạt Động & Doanh Thu</h4>
                      <p className="text-xs text-slate-500">Số liệu cập nhật theo thời gian thực từ cơ sở dữ liệu</p>
                    </div>
                    <button
                      onClick={() => loadTabData('overview')}
                      className="px-3.5 py-1.5 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-xs flex items-center gap-1.5"
                    >
                      <i className="fas fa-sync-alt text-xs"></i> Làm mới
                    </button>
                  </div>

                  {stats && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Tổng Doanh Thu</span>
                        <div className="text-2xl font-black text-blue-700 mt-2">
                          {formatMoney(stats.totalRevenue)}
                        </div>
                        <span className="text-[11px] text-emerald-600 font-semibold mt-1 block">
                          Từ {stats.paidOrders} đơn hàng đã thanh toán
                        </span>
                      </div>

                      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Đơn Hàng Đã Xử Lý</span>
                        <div className="text-2xl font-black text-slate-900 mt-2">
                          {stats.paidOrders} / {stats.totalOrders}
                        </div>
                        <span className="text-[11px] text-slate-500 font-semibold mt-1 block">
                          Tỷ lệ thành công: {stats.totalOrders > 0 ? Math.round((stats.paidOrders / stats.totalOrders) * 100) : 0}%
                        </span>
                      </div>

                      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Khách Hàng Đang Active</span>
                        <div className="text-2xl font-black text-emerald-600 mt-2">
                          {stats.activePaidUsers} Trả phí
                        </div>
                        <span className="text-[11px] text-indigo-600 font-semibold mt-1 block">
                          + {stats.activeTrialUsers} đang trong hạn dùng thử
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Quick Action Test Transaction */}
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 p-6 rounded-2xl space-y-3">
                    <h5 className="text-sm font-black text-blue-900 flex items-center gap-2">
                      <i className="fas fa-vial text-blue-600"></i>
                      Mô Phỏng Giao Dịch SePay (Test Thanh Toán Không Cần Chuyển Tiền Thật)
                    </h5>
                    <p className="text-xs text-blue-800 leading-relaxed">
                      Nhập mã đơn hàng cần test (ví dụ: <span className="font-mono font-bold">AFF000001</span>) và bấm "Kích hoạt Test". Hệ thống sẽ tự động kích hoạt gói và ghi nhận log như thể SePay vừa gửi Webhook xác nhận thanh toán thành công.
                    </p>
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <input
                        type="text"
                        placeholder="Mã đơn hàng (AFF...)"
                        value={testOrderCode}
                        onChange={(e) => setTestOrderCode(e.target.value)}
                        className="bg-white border border-slate-300 rounded-xl px-4 py-2 text-xs font-mono font-bold uppercase text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                      />
                      <button
                        type="button"
                        onClick={handleCreateMockTransaction}
                        className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm transition-all flex items-center gap-1.5"
                      >
                        <i className="fas fa-play"></i> Kích Hoạt Test
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: PLANS */}
              {activeTab === 'plans' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xl font-black text-slate-900">Danh Sách Gói Sử Dụng</h4>
                      <p className="text-xs text-slate-500">Cấu hình giá bán, số ngày sử dụng và trạng thái bật/tắt</p>
                    </div>
                    <button
                      onClick={() => setEditingPlan({
                        id: `plan_${Date.now().toString().slice(-4)}`,
                        name: 'Gói Mới',
                        description: '',
                        price: 199000,
                        days: 30,
                        is_active: 1,
                        is_featured: 0
                      })}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5"
                    >
                      <i className="fas fa-plus"></i> Thêm Gói Mới
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    {plans.map(p => (
                      <div key={p.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <h5 className="font-black text-base text-slate-900">{p.name}</h5>
                            {p.is_featured === 1 && (
                              <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-md">
                                Nổi bật
                              </span>
                            )}
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                              p.is_active === 1 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {p.is_active === 1 ? 'Đang kích hoạt' : 'Tạm tắt'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-1 max-w-xl">{p.description}</p>
                          <div className="flex items-center gap-4 text-xs font-semibold text-slate-600 mt-2">
                            <span>Thời hạn: <strong>{p.days >= 36500 ? 'Vĩnh viễn' : `${p.days} ngày`}</strong></span>
                            <span>Mã gói: <strong className="font-mono">{p.id}</strong></span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100">
                          <div className="text-right">
                            <div className="text-lg font-black text-blue-700">{formatMoney(p.price)}</div>
                          </div>
                          <button
                            onClick={() => setEditingPlan({ ...p })}
                            className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors"
                          >
                            <i className="fas fa-edit mr-1"></i> Sửa
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Edit Plan Modal */}
                  {editingPlan && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
                      <form onSubmit={handleSavePlan} className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-200 space-y-4">
                        <div className="flex items-center justify-between border-b pb-3">
                          <h4 className="font-black text-base text-slate-900">Chỉnh Sửa Gói Sử Dụng</h4>
                          <button type="button" onClick={() => setEditingPlan(null)}><i className="fas fa-times"></i></button>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">Mã Gói (ID)</label>
                          <input
                            type="text"
                            required
                            value={editingPlan.id}
                            onChange={(e) => setEditingPlan({ ...editingPlan, id: e.target.value })}
                            className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">Tên Gói</label>
                          <input
                            type="text"
                            required
                            value={editingPlan.name}
                            onChange={(e) => setEditingPlan({ ...editingPlan, name: e.target.value })}
                            className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">Mô tả gói</label>
                          <textarea
                            rows={2}
                            value={editingPlan.description}
                            onChange={(e) => setEditingPlan({ ...editingPlan, description: e.target.value })}
                            className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Giá (VNĐ)</label>
                            <input
                              type="number"
                              required
                              value={editingPlan.price}
                              onChange={(e) => setEditingPlan({ ...editingPlan, price: Number(e.target.value) })}
                              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-blue-700"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Số ngày (36500 = vĩnh viễn)</label>
                            <input
                              type="number"
                              required
                              value={editingPlan.days}
                              onChange={(e) => setEditingPlan({ ...editingPlan, days: Number(e.target.value) })}
                              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold"
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-6 pt-2">
                          <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editingPlan.is_active === 1}
                              onChange={(e) => setEditingPlan({ ...editingPlan, is_active: e.target.checked ? 1 : 0 })}
                              className="rounded text-blue-600"
                            />
                            Kích hoạt gói
                          </label>
                          <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editingPlan.is_featured === 1}
                              onChange={(e) => setEditingPlan({ ...editingPlan, is_featured: e.target.checked ? 1 : 0 })}
                              className="rounded text-blue-600"
                            />
                            Gói nổi bật
                          </label>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-3 border-t">
                          <button
                            type="button"
                            onClick={() => setEditingPlan(null)}
                            className="px-4 py-2 rounded-xl text-slate-600 text-xs font-bold hover:bg-slate-100"
                          >
                            Hủy
                          </button>
                          <button
                            type="submit"
                            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs"
                          >
                            Lưu Gói
                          </button>
                        </div>
                      </form>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: SEPAY SETTINGS */}
              {activeTab === 'sepay' && (
                <form onSubmit={handleSaveSepay} className="space-y-6 max-w-3xl">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xl font-black text-slate-900">Cấu Hình Kết Nối SePay</h4>
                      <p className="text-xs text-slate-500">Tài khoản ngân hàng VietQR và Webhook tự động</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={copyWebhookUrl}
                        className="px-3.5 py-1.5 rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 font-bold text-xs shadow-xs flex items-center gap-1.5"
                      >
                        <i className="fas fa-copy"></i> Copy Webhook URL
                      </button>
                      <button
                        type="button"
                        onClick={handleTestSepay}
                        className="px-3.5 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 font-bold text-xs shadow-xs flex items-center gap-1.5"
                      >
                        <i className="fas fa-plug"></i> Test Kết Nối
                      </button>
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                    <h5 className="font-black text-sm text-slate-900 border-b pb-2">1. Thông Tin Tài Khoản Ngân Hàng</h5>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Tên Ngân Hàng</label>
                        <input
                          type="text"
                          required
                          value={sepaySettings.bank_name}
                          onChange={(e) => setSepaySettings({ ...sepaySettings, bank_name: e.target.value })}
                          placeholder="Ví dụ: MBBank (Ngân hàng Quân Đội)"
                          className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Mã Ngân Hàng (VietQR)</label>
                        <input
                          type="text"
                          required
                          value={sepaySettings.bank_code}
                          onChange={(e) => setSepaySettings({ ...sepaySettings, bank_code: e.target.value.toUpperCase() })}
                          placeholder="MB, VCB, ACB, TCB, VPB..."
                          className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Số Tài Khoản</label>
                        <input
                          type="text"
                          required
                          value={sepaySettings.account_number}
                          onChange={(e) => setSepaySettings({ ...sepaySettings, account_number: e.target.value })}
                          placeholder="0988888888"
                          className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Tên Chủ Tài Khoản</label>
                        <input
                          type="text"
                          required
                          value={sepaySettings.account_holder}
                          onChange={(e) => setSepaySettings({ ...sepaySettings, account_holder: e.target.value.toUpperCase() })}
                          placeholder="HUYNH HONG"
                          className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold uppercase"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                    <h5 className="font-black text-sm text-slate-900 border-b pb-2">2. Cấu Hình Tích Hợp SePay & Webhook</h5>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">SePay API Key</label>
                        <input
                          type="password"
                          value={sepaySettings.api_key}
                          onChange={(e) => setSepaySettings({ ...sepaySettings, api_key: e.target.value })}
                          placeholder="Lấy tại my.sepay.vn"
                          className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">SePay Webhook Secret (Khóa xác thực)</label>
                        <input
                          type="password"
                          value={sepaySettings.webhook_secret}
                          onChange={(e) => setSepaySettings({ ...sepaySettings, webhook_secret: e.target.value })}
                          placeholder="Secret để bảo vệ webhook"
                          className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Tiền tố mã đơn hàng</label>
                        <input
                          type="text"
                          value={sepaySettings.order_prefix}
                          onChange={(e) => setSepaySettings({ ...sepaySettings, order_prefix: e.target.value.toUpperCase() })}
                          placeholder="AFF"
                          className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold"
                        />
                        <span className="text-[10px] text-slate-400 mt-1 block">Ví dụ: AFF000001</span>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Đường dẫn Webhook</label>
                        <input
                          type="text"
                          readOnly
                          value="/api/sepay-webhook"
                          className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-600 cursor-not-allowed"
                        />
                      </div>
                    </div>

                    <div className="pt-2">
                      <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={sepaySettings.is_active === 1}
                          onChange={(e) => setSepaySettings({ ...sepaySettings, is_active: e.target.checked ? 1 : 0 })}
                          className="rounded text-blue-600"
                        />
                        Kích hoạt cổng thanh toán tự động SePay
                      </label>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={loading}
                      className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all flex items-center gap-2"
                    >
                      <i className="fas fa-save"></i> Lưu Cấu Hình SePay
                    </button>
                  </div>
                </form>
              )}

              {/* TAB 4: TRIAL SETTINGS */}
              {activeTab === 'trial' && (
                <form onSubmit={handleSaveTrial} className="space-y-6 max-w-2xl">
                  <div>
                    <h4 className="text-xl font-black text-slate-900">Cài Đặt Chương Trình Dùng Thử</h4>
                    <p className="text-xs text-slate-500">Thiết lập thời gian và giới hạn trải nghiệm miễn phí</p>
                  </div>

                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b">
                      <span className="text-xs font-bold text-slate-700">Trạng thái chương trình dùng thử:</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={trialSettings.is_active === 1}
                          onChange={(e) => setTrialSettings({ ...trialSettings, is_active: e.target.checked ? 1 : 0 })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                      </label>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Số giờ dùng thử</label>
                        <input
                          type="number"
                          required
                          value={trialSettings.trial_hours}
                          onChange={(e) => setTrialSettings({ ...trialSettings, trial_hours: Number(e.target.value) })}
                          className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Tiêu đề nút hiển thị</label>
                        <input
                          type="text"
                          required
                          value={trialSettings.button_title}
                          onChange={(e) => setTrialSettings({ ...trialSettings, button_title: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Nội dung mô tả</label>
                      <textarea
                        rows={2}
                        value={trialSettings.description}
                        onChange={(e) => setTrialSettings({ ...trialSettings, description: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Link chuyển đến khi kích hoạt dùng thử (Tùy chọn)
                      </label>
                      <input
                        type="text"
                        placeholder="Để trống sẽ tự động mở giao diện ứng dụng hiện tại"
                        value={trialSettings.app_redirect_url || ''}
                        onChange={(e) => setTrialSettings({ ...trialSettings, app_redirect_url: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">
                        Khi người dùng bấm "Bắt đầu dùng thử" thành công, hệ thống sẽ chuyển đến link app này và mở trọn bộ tính năng dùng thử.
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Lượt dùng thử tối đa / Email</label>
                        <input
                          type="number"
                          required
                          value={trialSettings.max_per_email}
                          onChange={(e) => setTrialSettings({ ...trialSettings, max_per_email: Number(e.target.value) })}
                          className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Lượt dùng thử tối đa / SĐT</label>
                        <input
                          type="number"
                          required
                          value={trialSettings.max_per_phone}
                          onChange={(e) => setTrialSettings({ ...trialSettings, max_per_phone: Number(e.target.value) })}
                          className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={loading}
                      className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-all flex items-center gap-2"
                    >
                      <i className="fas fa-save"></i> Lưu Cấu Hình Dùng Thử
                    </button>
                  </div>
                </form>
              )}

              {/* TAB: EMAIL SMTP & SENT EMAILS */}
              {activeTab === 'email' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xl font-black text-slate-900">Cấu hình Email Kích Hoạt Dùng Thử</h4>
                      <p className="text-xs text-slate-500">
                        Cấu hình máy chủ gửi email (SMTP) để tự động gửi liên kết kích hoạt dùng thử khi người dùng đăng ký.
                      </p>
                    </div>
                    <button
                      onClick={() => loadTabData('email')}
                      className="px-3.5 py-1.5 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <i className="fas fa-sync-alt text-xs"></i> Làm mới
                    </button>
                  </div>

                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setLoading(true);
                      try {
                        const res = await fetch('/api/admin/email-settings', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            'x-admin-passcode': passcode
                          },
                          body: JSON.stringify(emailSettings)
                        });
                        const data = await res.json();
                        if (!res.ok || !data.success) throw new Error(data.error || 'Lưu thất bại');
                        showToast('Đã lưu cấu hình Email SMTP thành công!');
                      } catch (err: any) {
                        showToast(err.message, true);
                      } finally {
                        setLoading(false);
                      }
                    }}
                    className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4"
                  >
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <span className="text-sm font-black text-slate-800">Thông tin Máy Chủ SMTP</span>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={emailSettings.is_active === 1}
                          onChange={(e) => setEmailSettings({ ...emailSettings, is_active: e.target.checked ? 1 : 0 })}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-xs font-bold text-slate-700">Kích hoạt gửi Email</span>
                      </label>
                    </div>

                    <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-3.5 text-xs flex items-start gap-2">
                      <i className="fas fa-lightbulb text-amber-600 text-sm mt-0.5"></i>
                      <div className="leading-relaxed">
                        <strong>Lưu ý về Gmail:</strong> Để gửi email qua Gmail SMTP, hãy sử dụng <strong>Mật khẩu ứng dụng (App Password)</strong> 16 ký tự của Google (bật Xác minh 2 bước trong tài khoản Google, sau đó tạo App Password). Nếu chưa nhập SMTP user/pass, hệ thống vẫn hoạt động ở chế độ mô phỏng an toàn và lưu link vào lịch sử bên dưới.
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">SMTP Host</label>
                        <input
                          type="text"
                          required
                          value={emailSettings.smtp_host}
                          onChange={(e) => setEmailSettings({ ...emailSettings, smtp_host: e.target.value })}
                          placeholder="smtp.gmail.com"
                          className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">SMTP Port</label>
                        <input
                          type="number"
                          required
                          value={emailSettings.smtp_port}
                          onChange={(e) => setEmailSettings({ ...emailSettings, smtp_port: Number(e.target.value) })}
                          placeholder="587 hoặc 465"
                          className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Tài khoản SMTP (Email gửi)</label>
                        <input
                          type="email"
                          value={emailSettings.smtp_user}
                          onChange={(e) => setEmailSettings({ ...emailSettings, smtp_user: e.target.value })}
                          placeholder="your-email@gmail.com"
                          className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Mật khẩu SMTP / App Password</label>
                        <input
                          type="password"
                          value={emailSettings.smtp_pass}
                          onChange={(e) => setEmailSettings({ ...emailSettings, smtp_pass: e.target.value })}
                          placeholder="Mật khẩu ứng dụng 16 ký tự"
                          className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Tên người gửi hiển thị (From Name)</label>
                        <input
                          type="text"
                          value={emailSettings.from_name}
                          onChange={(e) => setEmailSettings({ ...emailSettings, from_name: e.target.value })}
                          placeholder="AI Video Công Nghệ"
                          className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Email người gửi hiển thị (From Email)</label>
                        <input
                          type="email"
                          value={emailSettings.from_email}
                          onChange={(e) => setEmailSettings({ ...emailSettings, from_email: e.target.value })}
                          placeholder="noreply@domain.com hoặc để trống"
                          className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        type="submit"
                        disabled={loading}
                        className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer"
                      >
                        <i className="fas fa-save"></i> Lưu Cấu Hình Email SMTP
                      </button>
                    </div>
                  </form>

                  {/* Test Email Box */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-3">
                    <h5 className="text-sm font-black text-slate-800 flex items-center gap-2">
                      <i className="fas fa-paper-plane text-blue-600"></i> Gửi thử nghiệm kết nối Email
                    </h5>
                    <p className="text-xs text-slate-500">
                      Nhập địa chỉ email bất kỳ để gửi thử nghiệm và kiểm tra xem máy chủ SMTP có gửi thư thành công không.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2 max-w-xl">
                      <input
                        type="email"
                        value={testEmailAddress}
                        onChange={(e) => setTestEmailAddress(e.target.value)}
                        placeholder="test-recipient@gmail.com"
                        className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-mono"
                      />
                      <button
                        type="button"
                        disabled={testingEmail}
                        onClick={async () => {
                          if (!testEmailAddress.trim()) {
                            showToast('Vui lòng nhập email nhận thử nghiệm', true);
                            return;
                          }
                          setTestingEmail(true);
                          try {
                            const res = await fetch('/api/admin/email-test', {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                                'x-admin-passcode': passcode
                              },
                              body: JSON.stringify({ test_email: testEmailAddress.trim() })
                            });
                            const data = await res.json();
                            if (!res.ok || !data.success) throw new Error(data.error || 'Gửi test thất bại');
                            showToast(data.message || 'Đã gửi email thử nghiệm thành công!');
                            loadTabData('email');
                          } catch (err: any) {
                            showToast(err.message, true);
                          } finally {
                            setTestingEmail(false);
                          }
                        }}
                        className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {testingEmail ? (
                          <>
                            <i className="fas fa-spinner fa-spin"></i> Đang gửi...
                          </>
                        ) : (
                          <>
                            <i className="fas fa-paper-plane"></i> Gửi Email Test
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Sent Emails History */}
                  <div className="space-y-3">
                    <h5 className="text-sm font-black text-slate-800 flex items-center justify-between">
                      <span>Lịch Sử Gửi Email Kích Hoạt ({sentEmails.length})</span>
                      <span className="text-xs font-normal text-slate-500">Hiển thị 100 email gần nhất</span>
                    </h5>

                    <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto shadow-sm">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                            <th className="p-3.5">Thời Gian</th>
                            <th className="p-3.5">Người Nhận</th>
                            <th className="p-3.5">Tiêu Đề</th>
                            <th className="p-3.5">Trạng Thái</th>
                            <th className="p-3.5">Link Kích Hoạt</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {sentEmails.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="p-8 text-center text-slate-400 font-medium">
                                Chưa có email nào được gửi trong hệ thống.
                              </td>
                            </tr>
                          ) : (
                            sentEmails.map((mail) => (
                              <tr key={mail.id} className="hover:bg-slate-50/80 transition-colors">
                                <td className="p-3.5 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                                  {formatDate(mail.created_at)}
                                </td>
                                <td className="p-3.5">
                                  <div className="font-bold text-slate-900">{mail.to_email || mail.recipient_email}</div>
                                  <div className="text-[11px] text-slate-500 font-mono">ID: {mail.id}</div>
                                </td>
                                <td className="p-3.5 text-slate-700 font-medium max-w-xs truncate">
                                  {mail.subject}
                                </td>
                                <td className="p-3.5 whitespace-nowrap">
                                  {mail.status === 'sent' && (
                                    <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-black text-[10px]">
                                      <i className="fas fa-check-circle mr-1"></i> ĐÃ GỬI SMTP
                                    </span>
                                  )}
                                  {mail.status === 'simulated' && (
                                    <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 font-black text-[10px]">
                                      <i className="fas fa-info-circle mr-1"></i> MÔ PHỎNG (LƯU LINK)
                                    </span>
                                  )}
                                  {mail.status === 'failed' && (
                                    <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 font-black text-[10px]">
                                      <i className="fas fa-exclamation-triangle mr-1"></i> THẤT BẠI
                                    </span>
                                  )}
                                </td>
                                <td className="p-3.5">
                                  {mail.activation_link ? (
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          navigator.clipboard.writeText(mail.activation_link);
                                          showToast('Đã sao chép link kích hoạt!');
                                        }}
                                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                                        title={mail.activation_link}
                                      >
                                        <i className="fas fa-copy text-xs"></i> Chép link
                                      </button>
                                      <a
                                        href={mail.activation_link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 hover:underline text-[11px] font-bold"
                                      >
                                        Mở <i className="fas fa-external-link-alt text-[9px]"></i>
                                      </a>
                                    </div>
                                  ) : (
                                    <span className="text-slate-400">-</span>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 5: ORDERS */}
              {activeTab === 'orders' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xl font-black text-slate-900">Danh Sách Đơn Hàng ({orders.length})</h4>
                      <p className="text-xs text-slate-500">Tất cả đơn hàng tạo qua SePay</p>
                    </div>
                    <button
                      onClick={() => loadTabData('orders')}
                      className="px-3.5 py-1.5 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-xs flex items-center gap-1.5"
                    >
                      <i className="fas fa-sync-alt text-xs"></i> Làm mới
                    </button>
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto shadow-sm">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                          <th className="p-3.5">Mã Đơn</th>
                          <th className="p-3.5">Khách Hàng</th>
                          <th className="p-3.5">Gói</th>
                          <th className="p-3.5">Số Tiền</th>
                          <th className="p-3.5">Trạng Thái</th>
                          <th className="p-3.5">Ngày Tạo</th>
                          <th className="p-3.5">Thanh Toán Lúc</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {orders.length === 0 ? (
                          <tr><td colSpan={7} className="p-8 text-center text-slate-400">Chưa có đơn hàng nào</td></tr>
                        ) : (
                          orders.map((o) => (
                            <tr key={o.order_id} className="hover:bg-slate-50/70 transition-colors">
                              <td className="p-3.5 font-mono font-bold text-blue-700">{o.order_code}</td>
                              <td className="p-3.5">
                                <div className="font-bold text-slate-900">{o.customer_name}</div>
                                <div className="text-[11px] text-slate-500">{o.customer_email} • {o.customer_phone}</div>
                              </td>
                              <td className="p-3.5 font-bold text-slate-800">{o.plan_name}</td>
                              <td className="p-3.5 font-bold text-blue-700">{formatMoney(o.amount)}</td>
                              <td className="p-3.5">
                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                                  o.status === 'paid'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : o.status === 'pending'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-rose-100 text-rose-800'
                                }`}>
                                  {o.status === 'paid' ? 'Đã thanh toán' : o.status === 'pending' ? 'Chờ thanh toán' : o.status}
                                </span>
                              </td>
                              <td className="p-3.5 text-slate-500 text-[11px]">{formatDate(o.created_at)}</td>
                              <td className="p-3.5 text-slate-500 text-[11px]">{formatDate(o.paid_at)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 6: WEBHOOK LOGS */}
              {activeTab === 'webhooks' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xl font-black text-slate-900">Lịch Sử Webhook SePay ({webhookLogs.length})</h4>
                      <p className="text-xs text-slate-500">Nhật ký các request webhook nhận được từ cổng SePay</p>
                    </div>
                    <button
                      onClick={() => loadTabData('webhooks')}
                      className="px-3.5 py-1.5 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-xs flex items-center gap-1.5"
                    >
                      <i className="fas fa-sync-alt text-xs"></i> Làm mới
                    </button>
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto shadow-sm">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                          <th className="p-3.5">Thời Gian</th>
                          <th className="p-3.5">Nội Dung Chuyển</th>
                          <th className="p-3.5">Số Tiền</th>
                          <th className="p-3.5">Mã Đơn Phát Hiện</th>
                          <th className="p-3.5">Kết Quả</th>
                          <th className="p-3.5">Ghi Chú / Lỗi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {webhookLogs.length === 0 ? (
                          <tr><td colSpan={6} className="p-8 text-center text-slate-400">Chưa nhận webhook nào</td></tr>
                        ) : (
                          webhookLogs.map((log) => (
                            <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                              <td className="p-3.5 text-slate-500 text-[11px] font-mono">{formatDate(log.received_at)}</td>
                              <td className="p-3.5 font-mono text-slate-800 max-w-xs truncate">{log.payment_content || '-'}</td>
                              <td className="p-3.5 font-bold text-blue-700">{formatMoney(log.amount)}</td>
                              <td className="p-3.5 font-mono font-bold text-slate-900">{log.detected_order_code || '-'}</td>
                              <td className="p-3.5">
                                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                  log.result === 'success' || log.result === 'test_success'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-rose-100 text-rose-800'
                                }`}>
                                  {log.result}
                                </span>
                              </td>
                              <td className="p-3.5 text-slate-500 text-[11px] max-w-xs truncate">{log.error_message || 'Thành công'}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 7: ACTIVE USERS */}
              {activeTab === 'active_users' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xl font-black text-slate-900">Người Dùng Đang Active ({activeUsers.length})</h4>
                      <p className="text-xs text-slate-500">Tất cả tài khoản có quyền truy cập video AI</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleClearData('all')}
                        className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="Xóa toàn bộ khách hàng và gói dùng thử để test lại"
                      >
                        <i className="fas fa-trash-alt text-xs"></i> Xóa hết để test lại
                      </button>
                      <button
                        onClick={() => loadTabData('active_users')}
                        className="px-3.5 py-1.5 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <i className="fas fa-sync-alt text-xs"></i> Làm mới
                      </button>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto shadow-sm">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                          <th className="p-3.5">Khách Hàng</th>
                          <th className="p-3.5">Loại Gói</th>
                          <th className="p-3.5">Tên Gói</th>
                          <th className="p-3.5">Ngày Bắt Đầu</th>
                          <th className="p-3.5">Ngày Hết Hạn</th>
                          <th className="p-3.5">Trạng Thái</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {activeUsers.length === 0 ? (
                          <tr><td colSpan={6} className="p-8 text-center text-slate-400">Chưa có người dùng nào</td></tr>
                        ) : (
                          activeUsers.map((u) => {
                            const isPaid = u.subscription_type === 'paid';
                            return (
                              <tr key={u.id} className="hover:bg-slate-50/70 transition-colors">
                                <td className="p-3.5">
                                  <div className="font-bold text-slate-900">{u.customer_name}</div>
                                  <div className="text-[11px] text-slate-500">{u.customer_email} • {u.customer_phone}</div>
                                </td>
                                <td className="p-3.5">
                                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                    isPaid ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                                  }`}>
                                    {isPaid ? 'Trả Phí' : 'Dùng Thử'}
                                  </span>
                                </td>
                                <td className="p-3.5 font-bold text-slate-800">{u.plan_name || 'Gói Dùng Thử'}</td>
                                <td className="p-3.5 text-slate-500 text-[11px]">{formatDate(u.started_at)}</td>
                                <td className="p-3.5 text-slate-500 text-[11px]">{formatDate(u.expired_at)}</td>
                                <td className="p-3.5">
                                  <span className="text-emerald-700 font-bold text-[11px] flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Active
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 8: TRIAL USERS */}
              {activeTab === 'trial_users' && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="text-xl font-black text-slate-900">Quản Lý Người Dùng Dùng Thử ({trialUsers.length})</h4>
                      <p className="text-xs text-slate-500">Theo dõi lượt dùng thử, phát hiện lạm dụng thiết bị/IP</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleClearData('trials')}
                        className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="Xóa danh sách dùng thử để người dùng test lại từ đầu"
                      >
                        <i className="fas fa-trash-alt text-xs"></i> Xóa dữ liệu dùng thử
                      </button>
                      <select
                        value={trialFilter}
                        onChange={(e: any) => {
                          setTrialFilter(e.target.value);
                          setTimeout(() => loadTabData('trial_users'), 50);
                        }}
                        className="bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 outline-none"
                      >
                        <option value="all">Tất cả</option>
                        <option value="active">Đang dùng thử</option>
                        <option value="expired">Đã hết hạn</option>
                        <option value="upgraded">Đã nâng cấp trả phí</option>
                      </select>
                      <button
                        onClick={() => loadTabData('trial_users')}
                        className="px-3.5 py-1.5 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <i className="fas fa-sync-alt text-xs"></i>
                      </button>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto shadow-sm">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                          <th className="p-3.5">Khách Hàng</th>
                          <th className="p-3.5">Trạng Thái</th>
                          <th className="p-3.5">Thời Hạn</th>
                          <th className="p-3.5">IP / Thiết Bị</th>
                          <th className="p-3.5">Ngày Đăng Ký</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {trialUsers.length === 0 ? (
                          <tr><td colSpan={5} className="p-8 text-center text-slate-400">Không có bản ghi dùng thử nào</td></tr>
                        ) : (
                          trialUsers.map((t) => (
                            <tr key={t.id} className="hover:bg-slate-50/70 transition-colors">
                              <td className="p-3.5">
                                <div className="font-bold text-slate-900">{t.customer_name}</div>
                                <div className="text-[11px] text-slate-500">{t.customer_email} • {t.customer_phone}</div>
                              </td>
                              <td className="p-3.5">
                                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                  t.isUpgraded
                                    ? 'bg-blue-100 text-blue-800'
                                    : t.isExpired
                                    ? 'bg-slate-100 text-slate-600'
                                    : 'bg-emerald-100 text-emerald-800'
                                }`}>
                                  {t.statusLabel}
                                </span>
                              </td>
                              <td className="p-3.5 text-[11px]">
                                {!t.isExpired && !t.isUpgraded ? (
                                  <span className="text-emerald-700 font-bold">Còn ~{t.remainingHours} giờ</span>
                                ) : (
                                  <span className="text-slate-400">{formatDate(t.expired_at)}</span>
                                )}
                              </td>
                              <td className="p-3.5 font-mono text-[10px] text-slate-500 max-w-xs truncate">
                                {t.ip_address}
                              </td>
                              <td className="p-3.5 text-slate-500 text-[11px]">{formatDate(t.created_at)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </div>
          </div>
        )}
      </div>
    </div>
  );
};
