"use client";

import React, { useState } from "react";
import { useEffect } from "react";
import AdminHeader from "@/components/admin/AdminHeader";
import AdminDashboard from "@/components/admin/AdminDashboard";
import { getSeededAdminId } from "@/app/actions/auth";
import { getUserProfile } from "@/app/actions/settings";

export default function AdminPage() {
    const [view, setView] = useState('dashboard');
    const [userData, setUserData] = useState<any>(null);
    const [orgData, setOrgData] = useState<any>(null);

    const loadData = React.useCallback(async () => {
        try {
            const adminId = await getSeededAdminId();
            if (adminId) {
                const userResult = await getUserProfile(adminId);
                if (userResult.success && userResult.user) {
                    setUserData(userResult.user);
                    setOrgData(userResult.user.organization);
                }
            }
        } catch (error) {
            console.error("Failed to load admin settings data:", error);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // In a real app, these would come from Session/Context
    const adminUser = "Administrator";

    return (
        <div className="min-h-screen bg-[#F5F5F7] font-apple selection:bg-blue-600/10 selection:text-blue-700">
            <AdminHeader 
                userName={adminUser}
                organizationName={orgData?.name}
                logoPath={orgData?.logoPath ? (orgData.logoPath.startsWith('data:') ? orgData.logoPath : `/api/capture-serve?path=${encodeURIComponent(orgData.logoPath)}`) : null}
                onLogout={() => window.location.href = '/login'}
            />
            
            <main className="p-4 pt-2 max-w-[1700px] mx-auto">
                <AdminDashboard 
                    user={userData}
                    organization={orgData}
                    onUpdate={loadData}
                />
            </main>

            {/* View specific sheets or modals can go here if needed, 
                but our cards handle most things via expanded popups */}
        </div>
    );
}
