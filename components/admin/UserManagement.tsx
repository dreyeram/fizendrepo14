"use client";

import React, { useEffect, useState } from "react";
import { getAllUsers, createNewUser, removeUser, updateUser } from "@/app/actions/admin";
import { Plus, Trash2, X, Loader2, Users, Eye, EyeOff, Edit3 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useConfirm } from "@/lib/hooks/useConfirm";
import { useNotify } from "@/lib/store/ui.store";

interface User {
    id: string;
    username: string;
    fullName: string;
    role: string;
    createdAt: string;
    organization?: { name: string };
}
interface UserManagementProps {
    externalSelectedUser?: User | null;
    onExternalClose?: () => void;
}

export default function UserManagement({ externalSelectedUser, onExternalClose }: UserManagementProps = {}) {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [isEditing, setIsEditing] = useState(false);
    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [showPasswordInput, setShowPasswordInput] = useState(false);
    const confirm = useConfirm();
    const notify = useNotify();

    // Form state
    const [formData, setFormData] = useState({
        fullName: "",
        username: "",
        role: "DOCTOR",
        password: ""
    });

    // Handle external triggers
    useEffect(() => {
        if (externalSelectedUser) {
            handleEditUser(externalSelectedUser);
        }
    }, [externalSelectedUser]);

    function handleEditUser(user: User) {
        setIsEditing(true);
        setEditingUserId(user.id);
        setFormData({
            fullName: user.fullName,
            username: user.username,
            role: user.role || "DOCTOR",
            password: "" // password blank normally
        });
        setShowModal(true);
        setError("");
    }

    function resetFormModal() {
        setIsEditing(false);
        setEditingUserId(null);
        setFormData({ fullName: "", username: "", role: "DOCTOR", password: "" });
        setShowModal(false);
        setError("");
        if (onExternalClose) onExternalClose();
    }

    async function loadUsers() {
        setLoading(true);
        const result = await getAllUsers();
        if (result.success && result.users) {
            setUsers(result.users as User[]);
        }
        setLoading(false);
    }

    useEffect(() => {
        loadUsers();
    }, []);

    async function handleCreateOrUpdateUser(e: React.FormEvent) {
        e.preventDefault();
        setError("");
        setSaving(true);
        
        let result;
        if (isEditing && editingUserId) {
             result = await updateUser(editingUserId, {
                username: formData.username,
                fullName: formData.fullName,
                role: formData.role,
                password: formData.password
            });
        } else {
             result = await createNewUser({
                username: formData.username,
                fullName: formData.fullName,
                role: formData.role,
                password: formData.password || "TempPass123!"
            });
        }

        setSaving(false);

        if (result.success) {
            resetFormModal();
            loadUsers();
        } else {
            setError(result.error || "Failed to create user");
        }
    }

    async function handleDeleteUser(userId: string, userName: string) {
        const ok = await confirm({
            title: "Delete Staff Member",
            message: `Are you sure you want to delete "${userName}"? This cannot be undone.`,
            confirmLabel: "Delete User",
            variant: "danger"
        });
        
        if (!ok) return;

        const result = await removeUser(userId);
        if (result.success) {
            notify.success("User Deleted", `Successfully removed ${userName} from the team.`);
            loadUsers();
        } else {
            notify.error("Delete Failed", result.error || "Failed to delete user record.");
        }
    }

    const getRoleBadge = (role: string) => {
        const colors: Record<string, { text: string, bg: string, border: string }> = {
            ADMIN: { text: "text-amber-700", bg: "bg-amber-50", border: "border-amber-100" },
            DOCTOR: { text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-100" },
            ASSISTANT: { text: "text-blue-700", bg: "bg-blue-50", border: "border-blue-100" }
        };
        const color = colors[role] || colors.ASSISTANT;
        return (
            <span className={`px-4 py-1 rounded-xl text-xs font-semibold tracking-wider uppercase border ${color.bg} ${color.text} ${color.border} shadow-sm`}>
                {role}
            </span>
        );
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* Header */}
            <div className="flex justify-between items-center p-2">
                <div className="flex items-center gap-5">
                    <div className="p-4 bg-blue-100 rounded-[1.5rem] text-blue-600 shadow-inner">
                        <Users size={32} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-semibold text-slate-800 tracking-tight">Staff Management</h2>
                        <p className="text-slate-500 text-[11px] font-medium mt-1 uppercase tracking-wider">Accounts & Access Control</p>
                    </div>
                </div>
                <button
                    onClick={() => {
                        setIsEditing(false);
                        setEditingUserId(null);
                        setFormData({ fullName: "", username: "", role: "DOCTOR", password: "" });
                        setShowModal(true);
                        setError("");
                    }}
                    className="flex items-center justify-center gap-3 bg-white hover:bg-blue-50 text-blue-600 border border-blue-100 px-8 py-3.5 rounded-[1.25rem] font-semibold text-sm uppercase tracking-wider transition-all shadow-xl shadow-blue-900/5 active:scale-95"
                >
                    <Plus className="w-5 h-5 stroke-[2.5]" />
                    Add Staff
                </button>
            </div>

            {/* Users Table */}
            <div className="bg-white/40 backdrop-blur-2xl border border-white/80 rounded-[2.5rem] overflow-hidden shadow-2xl shadow-slate-200/60">
                {loading ? (
                    <div className="p-32 text-center text-slate-400">
                        <Loader2 className="w-12 h-12 animate-spin text-blue-500 mx-auto mb-6" />
                        <p className="font-semibold uppercase tracking-wider text-xs animate-pulse">Retrieving staff members...</p>
                    </div>
                ) : users.length === 0 ? (
                    <div className="p-32 text-center text-slate-400">
                        <div className="w-24 h-24 bg-slate-50 rounded-[2rem] flex items-center justify-center mb-6 shadow-inner mx-auto">
                            <Users className="w-10 h-10 text-slate-300" />
                        </div>
                        <h3 className="text-lg font-semibold text-slate-800 mb-2">No users found</h3>
                        <p className="max-w-xs text-sm font-medium mx-auto text-slate-500">Click "Add Staff" to create your first team member account.</p>
                    </div>
                ) : (
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-white/50 border-b border-white text-xs uppercase font-semibold tracking-wider text-slate-500">
                                <th className="px-10 py-6">Staff Member</th>
                                <th className="px-10 py-6">Handle</th>
                                <th className="px-10 py-6">Access Level</th>
                                <th className="px-10 py-6">Registration</th>
                                <th className="px-10 py-6 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/50">
                            {users.map((user) => (
                                <tr key={user.id} className="hover:bg-white/60 transition-all group">
                                    <td className="px-10 py-6">
                                        <div className="flex items-center gap-5">
                                            <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 font-semibold text-lg shadow-sm group-hover:bg-blue-600 group-hover:text-white transition-all group-hover:shadow-lg group-hover:shadow-blue-200 group-hover:-translate-y-0.5">
                                                {user.fullName.charAt(0).toUpperCase()}
                                            </div>
                                            <span className="font-semibold text-slate-800 text-base tracking-tight group-hover:text-blue-700 transition-colors">{user.fullName}</span>
                                        </div>
                                    </td>
                                    <td className="px-10 py-6 text-slate-500 font-semibold uppercase tracking-wider text-xs">
                                        @{user.username}
                                    </td>
                                    <td className="px-10 py-6">
                                        {getRoleBadge(user.role)}
                                    </td>
                                    <td className="px-10 py-6 text-slate-500 text-sm font-medium">
                                        {new Date(user.createdAt).toLocaleDateString()}
                                    </td>
                                    <td className="px-10 py-6 text-right">
                                        <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                                            <button
                                                onClick={() => handleEditUser(user)}
                                                className="p-3 text-slate-400 hover:text-blue-600 bg-white hover:shadow-lg rounded-xl transition-all border border-transparent hover:border-blue-100"
                                                title="Edit User"
                                            >
                                                <Edit3 className="w-5 h-5" />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteUser(user.id, user.fullName)}
                                                className="p-3 text-slate-400 hover:text-rose-600 bg-white hover:shadow-lg rounded-xl transition-all border border-transparent hover:border-rose-100"
                                                title="Delete User"
                                            >
                                                <Trash2 className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Create User Modal */}
            <AnimatePresence>
                {showModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => resetFormModal()}
                            className="absolute inset-0 bg-slate-900/20 backdrop-blur-md"
                        />
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="relative w-full max-w-xl bg-white/95 backdrop-blur-2xl border border-white rounded-[3rem] shadow-[0_32px_128px_-16px_rgba(0,0,0,0.15)] overflow-hidden"
                        >
                            <div className="flex items-center justify-between p-8 border-b border-slate-50 bg-white/50">
                                <h3 className="text-xl font-semibold text-slate-800 flex items-center gap-4 tracking-tight">
                                    <div className="p-3 bg-blue-50 rounded-2xl text-blue-600">
                                        {isEditing ? <Edit3 size={24} className="stroke-[2.5]" /> : <Plus size={24} className="stroke-[2.5]" />}
                                    </div>
                                    {isEditing ? `Edit Staff: ${formData.fullName}` : "Add New Staff"}
                                </h3>
                                <button
                                    onClick={() => resetFormModal()}
                                    className="p-3 text-slate-400 hover:text-slate-900 hover:bg-slate-50 rounded-full transition-all"
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            <form onSubmit={handleCreateOrUpdateUser} className="p-10 space-y-8">
                                {error && (
                                    <div className="flex items-center gap-3 p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 text-sm font-bold">
                                        <X className="w-5 h-5" />
                                        {error}
                                    </div>
                                )}

                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 ml-2">
                                        Full Name *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.fullName}
                                        onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                                        className="w-full bg-slate-50/50 border border-slate-100 rounded-2xl px-6 py-4 text-slate-800 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all font-semibold"
                                        placeholder="Dr. John Doe"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 ml-2">
                                        Username *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.username}
                                        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                        className="w-full bg-slate-50/50 border border-slate-100 rounded-2xl px-6 py-4 text-slate-800 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all font-semibold"
                                        placeholder="johndoe"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 ml-2">
                                        Access Role
                                    </label>
                                    <select
                                        value={formData.role}
                                        onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                        className="w-full bg-slate-50/50 border border-slate-100 rounded-2xl px-6 py-4 text-slate-800 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all text-sm font-semibold appearance-none"
                                    >
                                        <option value="DOCTOR">Doctor</option>
                                        <option value="ASSISTANT">Assistant</option>
                                        <option value="ADMIN">Admin</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 ml-2">
                                        {isEditing ? "Reset Password (Leave blank to keep current)" : "Initial Password *"}
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={showPasswordInput ? "text" : "password"}
                                            required={!isEditing}
                                            minLength={!isEditing ? 8 : undefined}
                                            value={formData.password}
                                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                            className="w-full bg-slate-50/50 border border-slate-100 rounded-2xl px-6 py-4 pr-14 text-slate-800 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all text-sm font-semibold"
                                            placeholder={isEditing ? "••••••••" : "Min 8 chars, e.g. TempPass1!"}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPasswordInput(p => !p)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700 transition-colors"
                                        >
                                            {showPasswordInput ? <EyeOff size={18} /> : <Eye size={18} />}
                                        </button>
                                    </div>
                                    {!isEditing && (
                                        <p className="text-[10px] text-slate-400 font-medium mt-2 ml-2">Minimum 8 characters • blank uses: TempPass123!</p>
                                    )}
                                </div>

                                <div className="flex gap-4 pt-4">
                                    <button
                                        type="button"
                                        onClick={() => resetFormModal()}
                                        className="flex-1 py-5 bg-slate-50 hover:bg-slate-100 text-slate-800 rounded-[1.5rem] font-semibold uppercase tracking-wider px-4 transition-all"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={saving}
                                        className="flex-[2] py-5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-[1.5rem] font-semibold uppercase tracking-wider transition-all flex items-center justify-center gap-3 shadow-2xl shadow-blue-500/20"
                                    >
                                        {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : (isEditing ? <Edit3 size={20} className="stroke-[2.5]" /> : <Plus size={20} className="stroke-[2.5]" />)}
                                        {saving ? (isEditing ? "Updating..." : "Creating...") : (isEditing ? "Save Changes" : "Create Account")}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}

