"use client";

import React, { useState, useEffect } from "react";
import { 
    Users, 
    Building2, 
    Stethoscope, 
    Pill, 
    Wrench,
    RefreshCw
} from "lucide-react";
import AdminCard, { AdminCardItem } from "./AdminCard";
import UserManagement from "./UserManagement";
import OrganizationSettings from "../settings/OrganizationSettings";
import EquipmentSettings from "../settings/EquipmentSettings";
import InventoryManagement from "./InventoryManagement";
import { getAdminStats } from "@/app/actions/admin";

interface AdminDashboardProps {
    user: any;
    organization: any;
    onUpdate?: () => void;
}

export default function AdminDashboard({ user, organization, onUpdate }: AdminDashboardProps) {
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    // Controlled states for specific cards
    const [staffCardExpanded, setStaffCardExpanded] = useState(false);
    const [selectedEditUser, setSelectedEditUser] = useState<any>(null);

    const loadStats = async () => {
        setLoading(true);
        try {
            const res = await getAdminStats();
            if (res.success && res.stats) {
                setStats(res.stats);
            }
            setLoading(false);
        } catch (error) {
            console.error("Failed to load stats:", error);
            setLoading(false);
        }
    };

    useEffect(() => {
        loadStats();
    }, []);

    return (
        <div className="w-full space-y-8 animate-in fade-in duration-700 font-apple">
            {/* Header Section */}
            <div className="flex items-end justify-between px-2">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 tracking-tight leading-none">Dashboard Overview</h2>
                    <p className="text-slate-500 text-[13px] font-medium mt-1">Control center for clínica operations.</p>
                </div>
                <button
                    onClick={loadStats}
                    className="flex items-center gap-2 px-5 py-2 bg-white border border-black/[0.05] rounded-xl shadow-sm hover:shadow-md transition-all text-[12px] font-bold text-slate-600 active:scale-95"
                >
                    <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                    Refresh
                </button>
            </div>

            {/* Premium 3+2 Grid Layout */}
            <div className="space-y-6">
                {/* Top Row: 3 Cards */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* 1. Staff Management */}
                    <AdminCard
                        title="Staff & Access"
                        description="Manage users and permissions"
                        icon={Users}
                        onAdd={() => {
                            setSelectedEditUser(null);
                            setStaffCardExpanded(true);
                        }} 
                        isExpanded={staffCardExpanded}
                        onExpandedChange={setStaffCardExpanded}
                        expandedContent={
                            <UserManagement 
                                externalSelectedUser={selectedEditUser}
                                onExternalClose={() => setSelectedEditUser(null)}
                            />
                        }
                        count={stats?.totalStaff || 0}
                    >
                        <div className="space-y-1">
                            {stats?.recentUsers?.length > 0 ? (
                                stats.recentUsers.map((u: any) => (
                                    <AdminCardItem 
                                        key={u.id}
                                        label={u.fullName} 
                                        value={u.role} 
                                        onEdit={() => {
                                            setSelectedEditUser(u);
                                            setStaffCardExpanded(true);
                                        }}
                                    />
                                ))
                            ) : (
                                <AdminCardItem label={loading ? "Loading..." : "No staff found"} />
                            )}
                        </div>
                    </AdminCard>

                    {/* 2. Facility Branding */}
                    <AdminCard
                        title="Facility Profile"
                        description="Identity and branding settings"
                        icon={Building2}
                        expandedContent={
                            organization && (
                                <div className="max-w-4xl mx-auto">
                                    <OrganizationSettings 
                                        organization={organization} 
                                        onUpdate={onUpdate || (() => {})} 
                                    />
                                </div>
                            )
                        }
                    >
                        <div className="flex flex-col gap-1.5 pt-1">
                            {organization?.logoPath && (
                                <div className="p-2 mb-1 bg-slate-50/50 rounded-xl border border-black/[0.03] flex items-center justify-center h-12">
                                    <img 
                                        src={organization.logoPath.startsWith("uploads/") ? `/api/capture-serve?path=${organization.logoPath}` : `/${organization.logoPath}`} 
                                        alt="Logo" 
                                        className="h-full object-contain mix-blend-multiply" 
                                    />
                                </div>
                            )}
                            <div className="p-2.5 bg-slate-50/50 rounded-xl border border-black/[0.03]">
                                <p className="text-[12px] font-bold text-slate-800 truncate">{organization?.name || "Endoscopy Suite"}</p>
                                <p className="text-[10px] text-slate-500 font-medium truncate">
                                    {organization?.letterheadConfig ? (JSON.parse(organization.letterheadConfig).address || "No address set") : "No address set"}
                                </p>
                            </div>
                        </div>
                    </AdminCard>

                    {/* 3. Hardware Config */}
                    <AdminCard
                        title="Hardware Setup"
                        description="Camera and device integration"
                        icon={Stethoscope}
                        expandedContent={<EquipmentSettings />}
                        count={stats?.recentEquipment?.length}
                    >
                        <div className="space-y-1">
                            {stats?.recentEquipment?.length > 0 ? (
                                stats.recentEquipment.map((eq: any) => (
                                    <AdminCardItem 
                                        key={eq.id}
                                        label={eq.name} 
                                        value={eq.serialNumber ? `SN: ${eq.serialNumber}` : eq.type} 
                                    />
                                ))
                            ) : (
                                <AdminCardItem label={loading ? "Loading..." : "No equipment found"} />
                            )}
                        </div>
                    </AdminCard>
                </div>

                {/* Bottom Row: 2 Cards (Centered) */}
                <div className="flex justify-center">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full lg:w-[66.66%]">
                        {/* 4. Medical Inventory */}
                        <AdminCard
                            title="Inventory Hub"
                            description="Equipment and medicine stocks"
                            icon={Pill}
                            expandedContent={organization && <InventoryManagement organizationId={organization.id} />}
                            count={stats?.recentMedicines?.length}
                        >
                            <div className="space-y-1">
                                {stats?.recentMedicines?.length > 0 ? (
                                    stats.recentMedicines.map((med: any) => (
                                        <AdminCardItem 
                                            key={med.id}
                                            label={med.name} 
                                            value={`${med.category} • ${med.strength || 'N/A'}`} 
                                        />
                                    ))
                                ) : (
                                    <AdminCardItem label={loading ? "Loading..." : "No inventory entries"} />
                                )}
                            </div>
                        </AdminCard>

                        {/* 5. Maintenance */}
                        <AdminCard
                            title="Maintenance"
                            description="Database and system tools"
                            icon={Wrench}
                        >
                            <div className="space-y-1">
                                <AdminCardItem label="Database Size" value={stats?.storageGB ? `${stats.storageGB} GB` : "Calculating..."} />
                                <AdminCardItem label="Total Records" value={stats?.totalProcedures ? `${stats.totalProcedures} Procedures` : "0"} />
                                <AdminCardItem label="Engine" value="SQLite 3.x" />
                            </div>
                        </AdminCard>
                    </div>
                </div>
            </div>
        </div>
    );
}
