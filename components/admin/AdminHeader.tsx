"use client";

import React from "react";
import { Command, LogOut, Search, Bell, User } from "lucide-react";

interface AdminHeaderProps {
    userName: string;
    organizationName?: string;
    logoPath?: string | null;
    onLogout: () => void;
}

export default function AdminHeader({
    userName,
    organizationName = "Endoscopy Suite",
    logoPath,
    onLogout
}: AdminHeaderProps) {
    return (
        <header className="sticky top-0 z-[60] w-full bg-[#F5F5F7]/80 backdrop-blur-xl border-b border-black/[0.03] px-8 h-12 flex items-center justify-between font-apple">
            <div className="flex items-center gap-6">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-white shadow-sm overflow-hidden">
                        {logoPath ? (
                            <img src={logoPath} alt="Logo" className="w-full h-full object-cover" />
                        ) : (
                            <Command size={16} />
                        )}
                    </div>
                    <div>
                        <h1 className="text-sm font-bold text-slate-900 leading-tight">{organizationName}</h1>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Administrator Control</p>
                    </div>
                </div>

                <div className="hidden md:flex items-center bg-black/[0.03] rounded-full px-4 h-8 w-64 group focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-600/10 transition-all">
                    <Search size={14} className="text-slate-400 mr-2" />
                    <input 
                        type="text" 
                        placeholder="Search settings..."
                        className="bg-transparent border-none text-[12px] font-medium outline-none w-full placeholder:text-slate-400"
                    />
                </div>
            </div>

            <div className="flex items-center gap-3">
                <button className="p-2 rounded-full bg-black/[0.03] text-slate-500 hover:text-slate-900 transition-all relative">
                    <Bell size={18} />
                    <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-blue-600 border border-[#F5F5F7]"></span>
                </button>
                
                <div className="h-6 w-px bg-black/[0.05] mx-1"></div>

                <div className="flex items-center gap-3">
                    <div className="flex flex-col items-end hidden sm:flex">
                        <span className="text-[12px] font-bold text-slate-900">{userName}</span>
                        <span className="text-[9px] font-bold text-blue-600 uppercase tracking-wider">Super Admin</span>
                    </div>
                    <button className="w-8 h-8 rounded-full bg-white border border-black/[0.05] shadow-sm flex items-center justify-center text-slate-600 hover:border-blue-600 transition-all">
                        <User size={16} />
                    </button>
                    <button 
                        onClick={onLogout}
                        className="p-2 rounded-full bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white transition-all group"
                        title="Sign Out"
                    >
                        <LogOut size={16} className="group-hover:translate-x-0.5 transition-transform" />
                    </button>
                </div>
            </div>
        </header>
    );
}
