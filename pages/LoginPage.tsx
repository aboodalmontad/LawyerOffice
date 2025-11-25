import * as React from 'react';
import { getSupabaseClient } from '../supabaseClient';
import { ExclamationCircleIcon, EyeIcon, EyeSlashIcon, ClipboardDocumentIcon, ClipboardDocumentCheckIcon, ArrowTopRightOnSquareIcon, CheckCircleIcon, ShieldCheckIcon } from '../components/icons';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import type { User } from '@supabase/supabase-js';

interface AuthPageProps {
    onForceSetup: () => void;
    onLoginSuccess: (user: User, isOfflineLogin?: boolean) => void;
}

const LAST_USER_CREDENTIALS_CACHE_KEY = 'lawyerAppLastUserCredentials';

const CopyButton: React.FC<{ textToCopy: string }> = ({ textToCopy }) => {
    const [copied, setCopied] = React.useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(textToCopy).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };
    return (
        <button type="button" onClick={handleCopy} className="flex items-center gap-1 text-xs text-gray-300 hover:text-white" title="نسخ الأمر">
            {copied ? <ClipboardDocumentCheckIcon className="w-4 h-4 text-green-400" /> : <ClipboardDocumentIcon className="w-4 h-4" />}
            {copied ? 'تم النسخ' : 'نسخ'}
        </button>
    );
};

const DatabaseIcon: React.FC<{ className?: string }> = ({ className = "w-6 h-6" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
    </svg>
);

const LoginPage: React.FC<AuthPageProps> = ({ onForceSetup, onLoginSuccess }) => {
    const [isLoginView, setIsLoginView] = React.useState(true);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<React.ReactNode | null>(null);
    const [message, setMessage] = React.useState<string | null>(null);
    const [info, setInfo] = React.useState<string | null>(null);
    const [authFailed, setAuthFailed] = React.useState(false);
    const [showPassword, setShowPassword] = React.useState(false);
    const isOnline = useOnlineStatus();
    
    // Verification State
    const [isVerificationStep, setIsVerificationStep] = React.useState(false);
    const [verificationCode, setVerificationCode] = React.useState('');
    const [currentUserForVerification, setCurrentUserForVerification] = React.useState<User | null>(null);

    const [form, setForm] = React.useState({
        fullName: '',
        mobile: '',
        password: '',
    });
    
    React.useEffect(() => {
        try {
            const cachedCredentialsRaw = localStorage.getItem(LAST_USER_CREDENTIALS_CACHE_KEY);
            if (cachedCredentialsRaw) {
                const cachedCredentials = JSON.parse(cachedCredentialsRaw);
                if (cachedCredentials.mobile && cachedCredentials.password) {
                    setForm(prev => ({
                        ...prev,
                        mobile: cachedCredentials.mobile,
                        password: cachedCredentials.password
                    }));
                }
            }
        } catch (e) {
            console.error("Failed to load cached credentials:", e);
            localStorage.removeItem(LAST_USER_CREDENTIALS_CACHE_KEY);
        }
    }, []);

    React.useEffect(() => {
        if (!isOnline) {
            setInfo("أنت غير متصل. تسجيل الدخول متاح فقط للمستخدم الأخير الذي سجل دخوله على هذا الجهاز.");
        } else {
            setInfo(null);
        }
    }, [isOnline]);

    const supabase = getSupabaseClient();

    const toggleView = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsLoginView(prev => !prev);
        setError(null);
        setMessage(null);
        setInfo(isOnline ? null : "أنت غير متصل. تسجيل الدخول متاح فقط للمستخدم الأخير الذي سجل دخوله على هذا الجهاز.");
        setAuthFailed(false);
        setIsVerificationStep(false);
    };

    const normalizeMobileToE164 = (mobile: string): string | null => {
        const digits = mobile.replace(/\D/g, '');
        if (digits.length >= 9) {
            const lastNine = digits.slice(-9);
            if (lastNine.startsWith('9')) {
                return `+963${lastNine}`;
            }
        }
        return null;
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
        if (error) setError(null);
        if (authFailed) setAuthFailed(false);
    };

    const handleVerificationSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!supabase || !currentUserForVerification) return;
        setLoading(true);
        setError(null);

        try {
            // Check code against profile
            const { data: profile, error: fetchError } = await supabase
                .from('profiles')
                .select('verification_code, is_approved, phone_verified')
                .eq('id', currentUserForVerification.id)
                .single();

            if (fetchError || !profile) {
                throw new Error('فشل التحقق من الكود. يرجى المحاولة لاحقاً.');
            }

            if (profile.verification_code === verificationCode.trim()) {
                // Code matched, update profile
                const { error: updateError } = await supabase
                    .from('profiles')
                    .update({ phone_verified: true })
                    .eq('id', currentUserForVerification.id);

                if (updateError) throw updateError;

                // Re-check approval status
                if (profile.is_approved) {
                    onLoginSuccess(currentUserForVerification);
                } else {
                    setMessage("تم تأكيد رقم الهاتف بنجاح. يرجى انتظار موافقة المسؤول لتتمكن من الدخول.");
                    setIsVerificationStep(false);
                    setVerificationCode('');
                    setCurrentUserForVerification(null);
                }
            } else {
                setError("كود التفعيل غير صحيح. يرجى التأكد والمحاولة مرة أخرى.");
                setAuthFailed(true);
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setMessage(null);
        setAuthFailed(false);
    
        const phone = normalizeMobileToE164(form.mobile);
        if (!phone) {
            setError('رقم الجوال غير صالح. يجب أن يكون رقماً سورياً صحيحاً (مثال: 0912345678).');
            setLoading(false);
            setAuthFailed(true);
            return;
        }
        const email = `sy${phone.substring(1)}@email.com`;
    
        if (!supabase) {
            setError("Supabase client is not available.");
            setLoading(false);
            return;
        }
    
        const performOfflineLogin = () => {
            try {
                const LAST_USER_CACHE_KEY = 'lawyerAppLastUser';
                const LOGGED_OUT_KEY = 'lawyerAppLoggedOut';
                
                const cachedCredentialsRaw = localStorage.getItem(LAST_USER_CREDENTIALS_CACHE_KEY);
                const lastUserRaw = localStorage.getItem(LAST_USER_CACHE_KEY);
        
                if (!isLoginView) throw new Error('لا يمكن إنشاء حساب جديد بدون اتصال بالإنترنت.');
                if (!cachedCredentialsRaw || !lastUserRaw) throw new Error('فشل الاتصال بالخادم، ولا يوجد حساب مخزّن على هذا الجهاز. يرجى الاتصال بالإنترنت.');
    
                const cachedCredentials = JSON.parse(cachedCredentialsRaw);
                const normalize = (numStr: string) => (numStr || '').replace(/\D/g, '').slice(-9);
                
                if (normalize(cachedCredentials.mobile) === normalize(form.mobile) && cachedCredentials.password === form.password) {
                    localStorage.removeItem(LOGGED_OUT_KEY);
                    const user = JSON.parse(lastUserRaw) as User;
                    onLoginSuccess(user, true);
                } else {
                    throw new Error('بيانات الدخول غير صحيحة للوصول بدون انترنت.');
                }
            } catch (offlineErr: any) {
                setError(offlineErr.message);
                setAuthFailed(true);
            } finally {
                setLoading(false);
            }
        };
    
        if (isLoginView) {
            if (!isOnline) {
                performOfflineLogin();
                return;
            }
    
            try {
                const { data: { user }, error: signInError } = await supabase.auth.signInWithPassword({ email, password: form.password });
                if (signInError) throw signInError;
                if (!user) throw new Error("User not found");

                // Verification Flow Check
                const { data: profile, error: profileError } = await supabase
                    .from('profiles')
                    .select('phone_verified, is_approved, role')
                    .eq('id', user.id)
                    .single();

                if (profileError) throw profileError;

                // Admins bypass verification (optional, but good for safety)
                if (profile.role === 'admin') {
                     localStorage.setItem(LAST_USER_CREDENTIALS_CACHE_KEY, JSON.stringify({ mobile: form.mobile, password: form.password }));
                     onLoginSuccess(user);
                     return;
                }

                if (!profile.phone_verified) {
                    setCurrentUserForVerification(user);
                    setIsVerificationStep(true);
                    setInfo("يرجى إدخال كود التفعيل الذي أرسله المسؤول إلى رقمك عبر واتساب.");
                    setLoading(false);
                    return;
                }

                localStorage.setItem(LAST_USER_CREDENTIALS_CACHE_KEY, JSON.stringify({ mobile: form.mobile, password: form.password }));
                
                // Login successful and verified, App.tsx will handle "Pending Approval" check if needed, 
                // but we can also double check here to show a specific message if we want.
                // For consistency with the requested flow, user is approved AFTER verification.
                
                onLoginSuccess(user);

            } catch (err: any) {
                const lowerMsg = String(err.message).toLowerCase();
                if (!lowerMsg.includes('failed to fetch') && !lowerMsg.includes('networkerror')) {
                    console.error('Online Login error:', err);
                }
                if (lowerMsg.includes('failed to fetch') || lowerMsg.includes('networkerror')) {
                    setInfo("فشل الاتصال بالخادم. جاري محاولة تسجيل الدخول دون اتصال...");
                    performOfflineLogin();
                    return;
                }
                let displayError: React.ReactNode = 'حدث خطأ غير متوقع.';
                if (lowerMsg.includes('invalid login credentials')) {
                    displayError = "بيانات الدخول غير صحيحة.";
                    setAuthFailed(true);
                } else if (lowerMsg.includes('email not confirmed')) {
                    displayError = "البريد الإلكتروني غير مؤكد."; // Should be handled by trigger
                } else if (lowerMsg.includes('database is not configured') || lowerMsg.includes('relation "profiles" does not exist')) {
                    displayError = (
                        <div className="text-right w-full">
                            <p className="font-bold mb-2">خطأ: قاعدة البيانات غير مهيأة</p>
                            <button onClick={onForceSetup} className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">الإعداد</button>
                        </div>
                    );
                }
                setError(displayError);
                setLoading(false);
            }
        } else { // Sign up
            try {
                if (!isOnline) throw new Error('لا يمكن إنشاء حساب جديد بدون اتصال بالإنترنت.');
                
                const normalizeMobileForDBCheck = (mobile: string): string | null => {
                    const digits = mobile.replace(/\D/g, '');
                    if (digits.length >= 9) return '0' + digits.slice(-9);
                    return null;
                };

                const normalizedMobile = normalizeMobileForDBCheck(form.mobile);
                if (!normalizedMobile) {
                    setError('رقم الجوال غير صالح.');
                    setLoading(false);
                    setAuthFailed(true);
                    return;
                }

                const { data: mobileExists } = await supabase.rpc('check_if_mobile_exists', { mobile_to_check: normalizedMobile });
                if (mobileExists === true) {
                    setError('هذا الرقم مسجل بالفعل. يرجى تسجيل الدخول.');
                    setLoading(false);
                    setAuthFailed(true);
                    return;
                }
    
                // The trigger will generate verification_code
                const { data, error: signUpError } = await supabase.auth.signUp({
                    email,
                    password: form.password,
                    options: { 
                        data: { 
                            full_name: form.fullName, 
                            mobile_number: form.mobile
                        } 
                    }
                });
    
                if (signUpError) throw signUpError;
                
                if (data.user) {
                    setMessage("تم إنشاء الحساب. يرجى التواصل مع المسؤول للحصول على كود التفعيل.");
                    setIsLoginView(true);
                    setForm({ fullName: '', mobile: '', password: ''});
                } else {
                    throw new Error("لم يتم إرجاع بيانات المستخدم.");
                }
            } catch (err: any) {
                const lowerMsg = String(err.message).toLowerCase();
                if (lowerMsg.includes('user already registered') || lowerMsg.includes('unique constraint')) {
                    setError('هذا الحساب مسجل بالفعل.');
                } else {
                    setError('فشل إنشاء الحساب: ' + err.message);
                }
            } finally {
                setLoading(false);
            }
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4" dir="rtl">
            <div className="w-full max-w-md">
                <div className="text-center mb-6">
                    <h1 className="text-3xl font-bold text-gray-800">مكتب المحامي</h1>
                    <p className="text-gray-500">إدارة أعمال المحاماة بكفاءة</p>
                </div>

                <div className="bg-white p-8 rounded-lg shadow-md">
                    <h2 className="text-2xl font-bold text-center text-gray-700 mb-6">
                        {isVerificationStep ? 'تأكيد رقم الهاتف' : (isLoginView ? 'تسجيل الدخول' : 'إنشاء حساب جديد')}
                    </h2>

                    {error && (
                        <div className="mb-4 p-4 text-sm text-red-800 bg-red-100 rounded-lg flex items-start gap-3">
                            <ExclamationCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                            <div>{error}</div>
                        </div>
                    )}
                    {message && <div className="mb-4 p-4 text-sm text-green-800 bg-green-100 rounded-lg">{message}</div>}
                    {info && <div className="mb-4 p-4 text-sm text-blue-800 bg-blue-100 rounded-lg">{info}</div>}

                    {isVerificationStep ? (
                        <form onSubmit={handleVerificationSubmit} className="space-y-6">
                            <div>
                                <label htmlFor="verificationCode" className="block text-sm font-medium text-gray-700">كود التفعيل</label>
                                <input 
                                    id="verificationCode" 
                                    name="verificationCode" 
                                    type="text" 
                                    value={verificationCode} 
                                    onChange={(e) => setVerificationCode(e.target.value)} 
                                    required 
                                    placeholder="أدخل الكود المكون من 6 أرقام"
                                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-center text-lg tracking-widest" 
                                />
                            </div>
                            <button type="submit" disabled={loading} className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-green-300">
                                {loading ? 'جاري التحقق...' : 'تأكيد الكود'}
                            </button>
                            <button type="button" onClick={() => setIsVerificationStep(false)} className="w-full text-sm text-gray-500 hover:text-gray-700">العودة لتسجيل الدخول</button>
                        </form>
                    ) : (
                        <form onSubmit={handleAuth} className="space-y-6">
                            {!isLoginView && (
                                <div>
                                    <label htmlFor="fullName" className="block text-sm font-medium text-gray-700">الاسم الكامل</label>
                                    <input id="fullName" name="fullName" type="text" value={form.fullName} onChange={handleInputChange} required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
                                </div>
                            )}

                            <div>
                                <label htmlFor="mobile" className="block text-sm font-medium text-gray-700">رقم الجوال</label>
                                <input id="mobile" name="mobile" type="tel" value={form.mobile} onChange={handleInputChange} required placeholder="09xxxxxxxx" className={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${authFailed ? 'border-red-500' : 'border-gray-300'}`} />
                            </div>

                            <div>
                                <label htmlFor="password"
                                    className="block text-sm font-medium text-gray-700">كلمة المرور</label>
                                <div className="relative mt-1">
                                    <input id="password" name="password" type={showPassword ? 'text' : 'password'} value={form.password} onChange={handleInputChange} required className={`block w-full px-3 py-2 border rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${authFailed ? 'border-red-500' : 'border-gray-300'}`} />
                                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 left-0 px-3 flex items-center text-gray-400">
                                        {showPassword ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <button type="submit" disabled={loading || (!isOnline && !isLoginView)} className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-300">
                                    {loading ? 'جاري التحميل...' : (isLoginView ? 'تسجيل الدخول' : 'إنشاء الحساب')}
                                </button>
                            </div>
                        </form>
                    )}

                    {!isVerificationStep && (
                        <p className="mt-6 text-center text-sm text-gray-600">
                            {isLoginView ? 'ليس لديك حساب؟' : 'لديك حساب بالفعل؟'}
                            <a href="#" onClick={toggleView} className="font-medium text-blue-600 hover:text-blue-500 ms-1">
                                {isLoginView ? 'أنشئ حساباً جديداً' : 'سجل الدخول'}
                            </a>
                        </p>
                    )}
                </div>

                <div className="mt-6 text-center">
                    <a href="https://joint-fish-ila1mb4.gamma.site/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-blue-600 hover:underline">
                        <span>زيارة الصفحة الرئيسية للتطبيق</span>
                        <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                    </a>
                </div>
                <p className="mt-4 text-center text-xs text-gray-500">كافة الحقوق محفوظة للمحامي عبد الرحمن نحوي</p>
                <p className="mt-1 text-center text-xs text-gray-400">الإصدار: 23-11-2025</p>
            </div>
        </div>
    );
};

export default LoginPage;