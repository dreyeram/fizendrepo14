"use client";

import React, { useState } from "react";
import DashboardShell from "@/components/dashboard/DashboardShell";
import PatientManager from "@/components/dashboard/PatientManager";
import { useEffect } from "react";
import { getSeededDoctorId, getCurrentSession } from "@/app/actions/auth";
import { getUserProfile } from "@/app/actions/settings";

export default function AssistantPage() {
    const [view, setView] = useState('dashboard');
    const [userData, setUserData] = useState<any>(null);
    const [orgData, setOrgData] = useState<any>(null);

    useEffect(() => {
        const loadData = async () => {
            try {
                // ALWAYS use actual signed-in session user first
                const session = await getCurrentSession();
                const userId = session.success && session.user
                    ? session.user.id
                    : await getSeededDoctorId(); // Fallback only if no session

                if (userId) {
                    const result = await getUserProfile(userId);
                    if (result.success && result.user) {
                        setUserData(result.user);
                        setOrgData(result.user.organization);
                    }
                }
            } catch (error) {
                console.error("Failed to load assistant data:", error);
            }
        };
        loadData();
    }, []);

    const user = userData?.fullName || "Assistant";

    return (
        <DashboardShell
            role="ASSISTANT"
            userName={user}
            organizationName={orgData?.name}
            logoPath={orgData?.logoPath}
            currentView={view}
            onViewChange={setView}
            onLogout={() => window.location.href = '/login'}
        >

            {(view === 'dashboard' || view === 'patients') && (
                <PatientManager role="ASSISTANT" />
            )}

            {view === 'records' && (
                <div className="flex items-center justify-center h-full text-slate-400 font-medium">
                    Assistant Access restricted for Archives.
                </div>
            )}
        </DashboardShell>
    );
}
