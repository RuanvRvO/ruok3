"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter, usePathname } from "next/navigation";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { useEffect, useState } from "react";
import Image from "next/image";
import { Switch } from "@/components/ui/switch";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { Eye, Edit, LogOut, Users, UserCog, Building2, Plus, Menu } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { useMutation } from "convex/react";

export default function ManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
  const [isLoadingOrg, setIsLoadingOrg] = useState(true);

  // Get selected organization from localStorage and listen for changes
  useEffect(() => {
    if (typeof window !== "undefined") {
      const updateSelectedOrg = () => {
        const org = localStorage.getItem("selectedOrganization");
        setSelectedOrg(org);
        setIsLoadingOrg(false);
      };
      
      // Initial load
      updateSelectedOrg();
      
      // Listen for storage changes (from other tabs/windows)
      window.addEventListener("storage", updateSelectedOrg);
      
      // Listen for custom organizationChanged event
      window.addEventListener("organizationChanged", updateSelectedOrg);
      
      return () => {
        window.removeEventListener("storage", updateSelectedOrg);
        window.removeEventListener("organizationChanged", updateSelectedOrg);
      };
    }
  }, []);

  // Get user's role in selected organization
  const userRole = useQuery(
    api.organizationMemberships.getUserRoleInOrg,
    selectedOrg ? { organisation: selectedOrg } : "skip"
  );

  // Get all user organizations
  const userOrganizations = useQuery(api.organizationMemberships.getUserOrganizations);
  const createOrganization = useMutation(api.organizationMemberships.createOrganization);

  // Pending access requests count (for nav badge) — only fetched for owners
  const pendingAccessRequests = useQuery(
    api.accessRequests.listAccessRequests,
    selectedOrg && userRole === "owner" ? { organisation: selectedOrg, status: "pending" } : "skip"
  );
  const pendingAccessRequestCount = pendingAccessRequests?.length ?? 0;

  // Redirect to sign in if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/signin");
    }
  }, [isAuthenticated, isLoading, router]);

  // Auto-select first organization if none is selected and user has organizations
  useEffect(() => {
    // Only run if we're fully loaded and authenticated
    if (isLoading || isLoadingOrg || !isAuthenticated || userOrganizations === undefined) {
      return;
    }
    
    // If no org selected and user has at least one organization, auto-select the first one
    if (!selectedOrg && userOrganizations.length > 0) {
      const org = userOrganizations[0];
      localStorage.setItem("selectedOrganization", org.organisation);
      // Dispatch event to trigger state update via the storage listener
      window.dispatchEvent(new Event("organizationChanged"));
    }
  }, [isLoading, isLoadingOrg, isAuthenticated, selectedOrg, userOrganizations]);

  // Show loading while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-950 relative overflow-hidden">
        <div className="absolute inset-0 opacity-30 dark:opacity-20" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgb(148 163 184) 1px, transparent 0)`,
          backgroundSize: '24px 24px'
        }}></div>
        <div className="absolute top-20 left-10 w-64 h-64 bg-green-400/20 dark:bg-green-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 right-10 w-72 h-72 bg-blue-400/20 dark:bg-blue-500/10 rounded-full blur-3xl"></div>
        <div className="relative z-10 flex flex-col gap-8 w-full min-h-screen justify-center items-center px-4">
          <div className="flex items-center gap-6">
            <Image src="/smile.png" alt="Smile Logo" width={120} height={120} className="w-20 h-20 sm:w-24 sm:h-24 object-contain drop-shadow-lg" />
            <div className="w-px h-20 bg-slate-300 dark:bg-slate-600"></div>
            <Image src="/sad.png" alt="Sad Logo" width={120} height={120} className="w-20 h-20 sm:w-24 sm:h-24 object-contain drop-shadow-lg" />
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
            <div
              className="w-2 h-2 bg-slate-500 rounded-full animate-bounce"
              style={{ animationDelay: "0.1s" }}
            ></div>
            <div
              className="w-2 h-2 bg-slate-600 rounded-full animate-bounce"
              style={{ animationDelay: "0.2s" }}
            ></div>
            <p className="ml-2 text-slate-600 dark:text-slate-400">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  // Don't render if not authenticated
  if (!isAuthenticated) {
    return null;
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex flex-col gap-2 p-2">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center gap-2">
                <Image 
                  src="/smile.png" 
                  alt="Smile Logo" 
                  width={28} 
                  height={28}
                  className="object-contain"
                />
                <div className="w-px h-6 bg-slate-300 dark:bg-slate-600"></div>
                <Image
                  src="/sad.png"
                  alt="Sad Logo"
                  width={28}
                  height={28}
                  className="object-contain dark:hidden"
                />
              </div>
              <h1 className="text-base font-semibold text-slate-800 dark:text-slate-200 leading-tight">
                R u OK today?
              </h1>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent className="gap-5 hide-scrollbar min-w-0 overflow-x-hidden">
          <SidebarGroup className="p-1.5 min-w-0">
            <SidebarGroupContent className="min-w-0">
              <SidebarMenu className="gap-0.5 min-w-0">
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => router.push("/manager/view")}
                    isActive={pathname === "/manager/view"}
                    className="text-base data-[active=true]:bg-slate-300 dark:data-[active=true]:bg-slate-700"
                  >
                    <Eye className="size-4" />
                    <span>View Organization</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <ManagerLayoutNav pathname={pathname} router={router} userRole={userRole} pendingAccessRequestCount={pendingAccessRequestCount} />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarSeparator />
          <SidebarGroup className="p-1.5 min-w-0">
            <SidebarGroupLabel className="text-lg font-bold text-slate-900 dark:text-slate-100 px-2 py-5 tracking-tight">Your organisations</SidebarGroupLabel>
            <SidebarGroupContent className="min-w-0 pt-1">
              <UserOrganizationsList
                organizations={userOrganizations}
                router={router}
                selectedOrg={selectedOrg}
                setSelectedOrg={setSelectedOrg}
                pathname={pathname}
              />
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="flex flex-col gap-2 p-3">
          <CreateOrganizationButton 
            router={router} 
            createOrganization={createOrganization}
            setSelectedOrg={setSelectedOrg}
          />
          <SignOutButtonSidebar />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="relative overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800"></div>
        <div className="absolute inset-0 opacity-30 dark:opacity-20" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgb(148 163 184 / 0.4) 1px, transparent 0)`,
          backgroundSize: '32px 32px'
        }}></div>
        {/* Decorative Blobs */}
        <div className="absolute top-20 -left-20 w-72 h-72 bg-green-200/40 dark:bg-green-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 -right-20 w-96 h-96 bg-blue-200/40 dark:bg-blue-500/10 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-purple-200/20 dark:bg-purple-500/5 rounded-full blur-3xl"></div>
        
        <SidebarToggleButton />
        <MobileSidebarTrigger />
        <main className="relative z-10 p-4 sm:p-6 md:p-8 flex flex-col gap-4 sm:gap-6 md:gap-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}

function SidebarToggleButton() {
  const { open, toggleSidebar, isMobile } = useSidebar();

  // Hide on mobile - mobile uses the MobileSidebarTrigger instead
  if (isMobile) return null;

  return (
    <div
      className={`fixed top-4 z-50 bg-sidebar border-t border-b border-sidebar-border h-12 px-3 flex items-center transition-all duration-300 ${
        open ? 'left-[240px] border-r rounded-r' : 'left-0 border-r rounded-r shadow-sm'
      }`}
    >
      <Switch
        checked={open}
        onCheckedChange={toggleSidebar}
        className="data-[state=checked]:bg-blue-300 data-[state=unchecked]:bg-slate-300 dark:data-[state=unchecked]:bg-slate-600"
      />
    </div>
  );
}

function MobileSidebarTrigger() {
  const { toggleSidebar, isMobile } = useSidebar();

  // Only show on mobile
  if (!isMobile) return null;

  return (
    <button
      onClick={toggleSidebar}
      className="fixed top-4 left-4 z-50 flex items-center justify-center w-10 h-10 bg-sidebar border border-sidebar-border rounded-md shadow-sm hover:bg-sidebar-accent transition-colors"
      aria-label="Toggle sidebar"
    >
      <Menu className="w-5 h-5 text-sidebar-foreground" />
    </button>
  );
}

function ManagerLayoutNav({
  pathname,
  router,
  userRole,
  pendingAccessRequestCount,
}: {
  pathname: string;
  router: AppRouterInstance;
  userRole: "owner" | "editor" | "viewer" | null | undefined;
  pendingAccessRequestCount: number;
}) {
  const canEdit = userRole === "owner" || userRole === "editor";
  const isOwner = userRole === "owner";

  return (
    <>
      {canEdit && (
        <SidebarMenuItem>
          <SidebarMenuButton
            onClick={() => router.push("/manager/edit")}
            isActive={pathname === "/manager/edit"}
            className="text-base data-[active=true]:bg-slate-300 dark:data-[active=true]:bg-slate-700"
          >
            <Edit className="size-4" />
            <span>Edit Organization</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      )}
      {isOwner && (
        <SidebarMenuItem>
          <SidebarMenuButton
            onClick={() => router.push("/manager/managers")}
            isActive={pathname === "/manager/managers"}
            className="text-base data-[active=true]:bg-slate-300 dark:data-[active=true]:bg-slate-700"
          >
            <Users className="size-4" />
            <span>Viewer Access</span>
            {pendingAccessRequestCount > 0 && (
              <span className="ml-auto w-2 h-2 rounded-full bg-orange-400 shrink-0" />
            )}
          </SidebarMenuButton>
        </SidebarMenuItem>
      )}
      <SidebarMenuItem>
        <SidebarMenuButton
          onClick={() => router.push("/manager/account")}
          isActive={pathname === "/manager/account"}
          className="text-base data-[active=true]:bg-slate-300 dark:data-[active=true]:bg-slate-700"
        >
          <UserCog className="size-4" />
          <span>Account Settings</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </>
  );
}

function UserOrganizationsList({
  organizations,
  router,
  selectedOrg,
  setSelectedOrg,
  pathname,
}: {
  organizations: Array<{ _id: string; organisation: string; role: string }> | undefined;
  router: AppRouterInstance;
  selectedOrg: string | null;
  setSelectedOrg: (org: string | null) => void;
  pathname: string;
}) {
  if (!organizations || organizations.length === 0) {
    return null;
  }

  // Group organizations by role
  const ownerOrgs = organizations.filter((org) => org.role === "owner");
  const editorOrgs = organizations.filter((org) => org.role === "editor");
  const viewerOrgs = organizations.filter((org) => org.role === "viewer");

  const handleOrgClick = (orgName: string) => {
    localStorage.setItem("selectedOrganization", orgName);
    setSelectedOrg(orgName);
    // Dispatch a custom event to notify other components
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("organizationChanged"));
    }
    // Only redirect to view if we're on the root manager page
    // Otherwise, stay on the current page (managers, edit, account, etc.)
    if (pathname === "/manager" || pathname === "/manager/") {
      router.push("/manager/view");
    } else {
      // Just refresh to update the page with new organization data
      router.refresh();
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {ownerOrgs.length > 0 && (
        <div>
          <div className="text-sm font-medium text-slate-600 dark:text-slate-400 px-2 py-1 uppercase tracking-wide">
            Owner
          </div>
          <SidebarMenu className="gap-0.5 min-w-0">
            {ownerOrgs.map((org) => (
              <SidebarMenuItem key={org._id} className="min-w-0">
                <SidebarMenuButton
                  onClick={() => handleOrgClick(org.organisation)}
                  isActive={selectedOrg === org.organisation}
                  className="w-full min-w-0 text-base data-[active=true]:bg-slate-300 dark:data-[active=true]:bg-slate-700"
                >
                  <Building2 className="size-4 shrink-0" />
                  <span className="truncate min-w-0">{org.organisation}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </div>
      )}
      {editorOrgs.length > 0 && (
        <div>
          <div className="text-sm font-medium text-slate-600 dark:text-slate-400 px-2 py-1 uppercase tracking-wide">
            Editor
          </div>
          <SidebarMenu className="gap-0.5">
            {editorOrgs.map((org) => (
              <SidebarMenuItem key={org._id}>
                <SidebarMenuButton
                  onClick={() => handleOrgClick(org.organisation)}
                  isActive={selectedOrg === org.organisation}
                  className="w-full text-base data-[active=true]:bg-slate-300 dark:data-[active=true]:bg-slate-700"
                >
                  <Building2 className="size-4" />
                  <span className="truncate">{org.organisation}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </div>
      )}
      {viewerOrgs.length > 0 && (
        <div>
          <div className="text-sm font-medium text-slate-600 dark:text-slate-400 px-2 py-1 uppercase tracking-wide">
            Viewer
          </div>
          <SidebarMenu className="gap-0.5">
            {viewerOrgs.map((org) => (
              <SidebarMenuItem key={org._id}>
                <SidebarMenuButton
                  onClick={() => handleOrgClick(org.organisation)}
                  isActive={selectedOrg === org.organisation}
                  className="w-full text-base data-[active=true]:bg-slate-300 dark:data-[active=true]:bg-slate-700"
                >
                  <Building2 className="size-4" />
                  <span className="truncate">{org.organisation}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </div>
      )}
    </div>
  );
}

function CreateOrganizationButton({
  router,
  createOrganization,
  setSelectedOrg,
}: {
  router: AppRouterInstance;
  createOrganization: (args: { name: string }) => Promise<{ membershipId: string; organisation: string }>;
  setSelectedOrg: (org: string | null) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      const result = await createOrganization({ name: orgName.trim() });
      if (result?.organisation) {
        localStorage.setItem("selectedOrganization", result.organisation);
        setSelectedOrg(result.organisation);
        setShowForm(false);
        setOrgName("");
        router.push("/manager/view");
        router.refresh();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create organization");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="w-full">
      {showForm ? (
        <div className="flex flex-col gap-2 p-2 border border-sidebar-border rounded-lg bg-sidebar">
          <form onSubmit={handleCreate} className="flex flex-col gap-2">
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Organization name"
              className="w-full px-3 py-2 text-sm border border-sidebar-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              autoFocus
              disabled={creating}
              required
            />
            {error && (
              <p className="text-xs text-red-500">{error}</p>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={creating || !orgName.trim()}
                className="flex-1 px-3 py-2 text-xs font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:shadow-md active:scale-[0.98]"
              >
                {creating ? "Creating..." : "Create"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setOrgName("");
                  setError(null);
                }}
                disabled={creating}
                className="flex-1 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 transition-all active:scale-[0.98]"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-all border border-blue-200 dark:border-blue-800 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-sm active:scale-[0.98]"
        >
          <Plus className="size-4 flex-shrink-0" />
          <span className="flex-1 text-left">New Organization</span>
        </button>
      )}
    </div>
  );
}

function SignOutButtonSidebar() {
  const { signOut } = useAuthActions();
  const router = useRouter();
  return (
    <button
      onClick={() =>
        void signOut().then(() => {
          // Clear organization selection from localStorage
          localStorage.removeItem("selectedOrganization");
          router.push("/signin");
        })
      }
      className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
    >
      <LogOut className="size-4" />
      <span>Sign Out</span>
    </button>
  );
}
