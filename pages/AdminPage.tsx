import * as React from 'react';
import { getSupabaseClient } from '../supabaseClient';
import { Profile } from '../types';
import { formatDate, toInputDateString } from '../utils/dateUtils';
import { CheckCircleIcon, NoSymbolIcon, PencilIcon, TrashIcon, ExclamationTriangleIcon, ShareIcon, ShieldCheckIcon } from '../components/icons';
import { useData } from '../context/DataContext';
import UserDetailsModal from '../components/UserDetailsModal';

const formatSubscriptionDateRange = (user: Profile): string => {
    const { subscription_start_date, subscription_end_date } = user;
    if (!subscription_start_date || !subscription_end_date) return 'لا يوجد';
    const startDate = new Date(subscription_start_date);
    const endDate = new Date(subscription_end_date);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return 'تاريخ غير صالح';
    return `${formatDate(startDate)} - ${formatDate(endDate)}`;
};

const getDisplayPhoneNumber = (mobile: string | null | undefined): string => {
    if (!mobile) return '-';
    const digits = mobile.replace(/\D/g, '');
    if (digits.length >= 9) {
        const lastNine = digits.slice(-9);
        if (lastNine.startsWith('9')) return '0' + lastNine;
    }
    return mobile;
};

const AdminPage: React.FC = () => {
    const { profiles: users, setProfiles: setUsers, isDataLoading: loading, userId } = useData();
    const [error, setError] = React.useState<string | null>(null);
    const [editingUser, setEditingUser] = React.useState<Profile | null>(null);
    const [userToDelete, setUserToDelete] = React.useState<Profile | null>(null);
    const [viewingUser, setViewingUser] = React.useState<Profile | null>(null);
    const currentAdminId = userId;
    
    const supabase = getSupabaseClient();

    const handleUpdateUser = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!editingUser) return;
        
        // Here we would typically call Supabase update, but for this app we rely on manualSync/optimistic updates usually.
        // For the admin page, let's assume we push updates via RPC or direct update if policies allow.
        // Since strict mode requires direct Supabase interaction for admin functions often:
        if (supabase) {
             const { error } = await supabase.from('profiles').update({
                 full_name: editingUser.full_name,
                 subscription_start_date: editingUser.subscription_start_date,
                 subscription_end_date: editingUser.subscription_end_date,
                 is_approved: editingUser.is_approved,
                 is_active: editingUser.is_active
             }).eq('id', editingUser.id);
             if (error) console.error("Update failed", error);
        }

        setUsers(prevUsers => prevUsers.map(u => 
            u.id === editingUser.id ? { ...editingUser, updated_at: new Date() } : u
        ));

        setEditingUser(null);
    };

    const handleConfirmDelete = async () => {
        if (!supabase || !userToDelete) return;
        const userToDeleteId = userToDelete.id;
    
        try {
            const { error: rpcError } = await supabase.rpc('delete_user', { user_id_to_delete: userToDeleteId });
            if (rpcError) throw rpcError;
            setUsers(prevUsers => prevUsers.filter(u => u.id !== userToDeleteId));
        } catch (err: any) {
            setError("فشل حذف المستخدم. " + err.message);
        } finally {
            setUserToDelete(null);
        }
    };
    
    const toggleUserApproval = async (user: Profile) => {
         if (!supabase || user.role === 'admin') return;
         const updatedUser = { ...user, is_approved: !user.is_approved, updated_at: new Date() };
         setUsers(prev => prev.map(u => u.id === user.id ? updatedUser : u));
         await supabase.from('profiles').update({ is_approved: updatedUser.is_approved }).eq('id', user.id);
    }
    
    const toggleUserActiveStatus = async (user: Profile) => {
         if (!supabase || user.role === 'admin') return;
         const updatedUser = { ...user, is_active: !user.is_active, updated_at: new Date() };
         setUsers(prev => prev.map(u => u.id === user.id ? updatedUser : u));
         await supabase.from('profiles').update({ is_active: updatedUser.is_active }).eq('id', user.id);
    }

    const sendVerificationCode = (user: Profile) => {
        if (!user.verification_code) return;
        // Format for international standard without leading 0, assuming Syrian +963
        // The stored mobile usually is 09... or similar. 
        // Let's strip everything and ensure it starts with 963 if it's a syrian number starting with 09
        let phone = user.mobile_number.replace(/\D/g, '');
        if (phone.startsWith('09')) phone = '963' + phone.substring(1);
        else if (phone.startsWith('9')) phone = '963' + phone; // fallback logic
        
        const message = `مرحباً ${user.full_name}،\nكود تفعيل حسابك في تطبيق مكتب المحامي هو: *${user.verification_code}*`;
        const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    };
    
    const sortedUsers = React.useMemo(() => {
        return [...users].sort((a, b) => {
            if (a.is_approved !== b.is_approved) return a.is_approved ? 1 : -1;
            const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
            const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
            return dateB - dateA;
        });
    }, [users]);


    if (loading) return <div className="text-center p-8">جاري تحميل المستخدمين...</div>;
    if (error) return <div className="p-4 text-red-700 bg-red-100 rounded-md">{error}</div>;

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-800">إدارة المستخدمين</h1>
            
            <div className="bg-white p-6 rounded-lg shadow overflow-x-auto">
                <table className="w-full text-sm text-right text-gray-600">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-100">
                        <tr>
                            <th className="px-6 py-3">الاسم الكامل</th>
                            <th className="px-6 py-3">رقم الجوال</th>
                            <th className="px-6 py-3">تأكيد الهاتف</th>
                            <th className="px-6 py-3">كود التفعيل</th>
                            <th className="px-6 py-3">الاشتراك</th>
                            <th className="px-6 py-3">موافق عليه</th>
                            <th className="px-6 py-3">الحساب نشط</th>
                            <th className="px-6 py-3">إجراءات</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedUsers.map(user => (
                            <tr key={user.id} className={`border-b ${!user.is_approved ? 'bg-yellow-50' : 'bg-white'}`}>
                                <td className="px-6 py-4 font-medium text-gray-900">
                                    <button onClick={() => setViewingUser(user)} className="text-blue-600 hover:underline">
                                        {user.full_name}
                                    </button>
                                    {user.role === 'admin' && <span className="text-xs font-semibold text-blue-600 ms-2">(مدير)</span>}
                                </td>
                                <td className="px-6 py-4">{getDisplayPhoneNumber(user.mobile_number)}</td>
                                <td className="px-6 py-4 text-center">
                                    {user.phone_verified ? 
                                        <ShieldCheckIcon className="w-5 h-5 text-green-600 mx-auto" title="تم تأكيد الهاتف" /> : 
                                        <span className="inline-block w-3 h-3 rounded-full bg-red-400" title="غير مؤكد"></span>
                                    }
                                </td>
                                <td className="px-6 py-4">
                                    {user.role !== 'admin' && user.verification_code && !user.phone_verified && (
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono font-bold bg-gray-100 px-2 rounded">{user.verification_code}</span>
                                            <button onClick={() => sendVerificationCode(user)} className="text-green-600 hover:text-green-800" title="إرسال عبر واتساب">
                                                <ShareIcon className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}
                                    {user.phone_verified && <span className="text-xs text-green-600">تم التفعيل</span>}
                                </td>
                                <td className="px-6 py-4">{formatSubscriptionDateRange(user)}</td>
                                <td className="px-6 py-4">
                                    <button onClick={() => toggleUserApproval(user)} disabled={user.role === 'admin'} className="disabled:opacity-50 disabled:cursor-not-allowed">
                                        {user.is_approved ? <CheckCircleIcon className="w-6 h-6 text-green-500" /> : <NoSymbolIcon className="w-6 h-6 text-gray-400" />}
                                    </button>
                                </td>
                                <td className="px-6 py-4">
                                     <button onClick={() => toggleUserActiveStatus(user)} disabled={user.role === 'admin'} className="disabled:opacity-50 disabled:cursor-not-allowed">
                                        {user.is_active ? <CheckCircleIcon className="w-6 h-6 text-green-500" /> : <NoSymbolIcon className="w-6 h-6 text-red-500" />}
                                    </button>
                                </td>
                                <td className="px-6 py-4">
                                    {user.role !== 'admin' && user.id !== currentAdminId ? (
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => setEditingUser(user)} className="p-2 text-gray-500 hover:text-blue-600" title="تعديل"><PencilIcon className="w-4 h-4" /></button>
                                            <button onClick={() => setUserToDelete(user)} className="p-2 text-gray-500 hover:text-red-600" title="حذف"><TrashIcon className="w-4 h-4" /></button>
                                        </div>
                                    ) : (
                                        <span className="text-xs text-gray-400">--</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {editingUser && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 p-4 overflow-y-auto" onClick={() => setEditingUser(null)}>
                    <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                        <h2 className="text-xl font-bold mb-4">تعديل المستخدم: {editingUser.full_name}</h2>
                        <form onSubmit={handleUpdateUser} className="space-y-4">
                            <div><label className="block text-sm font-medium text-gray-700">الاسم الكامل</label><input type="text" value={editingUser.full_name} onChange={e => setEditingUser({ ...editingUser, full_name: e.target.value })} className="w-full p-2 border rounded" /></div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-sm font-medium text-gray-700">تاريخ بدء الاشتراك</label><input type="date" value={toInputDateString(editingUser.subscription_start_date)} onChange={e => setEditingUser({ ...editingUser, subscription_start_date: e.target.value })} className="w-full p-2 border rounded" /></div>
                                <div><label className="block text-sm font-medium text-gray-700">تاريخ انتهاء الاشتراك</label><input type="date" value={toInputDateString(editingUser.subscription_end_date)} onChange={e => setEditingUser({ ...editingUser, subscription_end_date: e.target.value })} className="w-full p-2 border rounded" /></div>
                            </div>
                            <div className="flex items-center gap-6 pt-2">
                                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={editingUser.is_approved} onChange={e => setEditingUser({ ...editingUser, is_approved: e.target.checked })} className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500" /> موافق عليه</label>
                                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={editingUser.is_active} onChange={e => setEditingUser({ ...editingUser, is_active: e.target.checked })} className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500" /> الحساب نشط</label>
                            </div>
                            <div className="flex justify-end gap-4 pt-4"><button type="button" onClick={() => setEditingUser(null)} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">إلغاء</button><button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">حفظ التغييرات</button></div>
                        </form>
                    </div>
                </div>
            )}
            
             {userToDelete && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setUserToDelete(null)}>
                    <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                         <div className="text-center">
                            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4"><ExclamationTriangleIcon className="h-8 w-8 text-red-600" /></div>
                            <h3 className="text-2xl font-bold text-gray-900">تأكيد حذف المستخدم</h3>
                            <p className="text-gray-600 my-4">هل أنت متأكد من حذف المستخدم "{userToDelete.full_name}"؟ سيتم حذف جميع بياناته بشكل نهائي ولا يمكن التراجع عن هذا الإجراء.</p>
                        </div>
                        <div className="mt-6 flex justify-center gap-4">
                            <button type="button" className="px-6 py-2 bg-gray-200 rounded-lg" onClick={() => setUserToDelete(null)}>إلغاء</button>
                            <button type="button" className="px-6 py-2 bg-red-600 text-white rounded-lg" onClick={handleConfirmDelete}>نعم، قم بالحذف</button>
                        </div>
                    </div>
                </div>
            )}

            {viewingUser && (
                <UserDetailsModal 
                    user={viewingUser} 
                    onClose={() => setViewingUser(null)}
                    onEdit={() => setEditingUser(viewingUser)}
                />
            )}
        </div>
    );
};

export default AdminPage;