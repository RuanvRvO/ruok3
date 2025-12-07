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
import { Eye, Edit, LogOut, Users, UserCog, Building2, Plus } from "lucide-react";
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
  const user = useQuery(api.users.getCurrentUser);
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
    api.users.getUserRoleInOrg,
    selectedOrg ? { organisation: selectedOrg } : "skip"
  );

  // Get all user organizations
  const userOrganizations = useQuery(api.organizationMemberships.getUserOrganizations);
  const createOrganization = useMutation(api.organizationMemberships.createOrganization);
  const fixOrphanedMemberships = useMutation(api.managerInvitations.fixOrphanedMemberships);

  // Redirect to sign in if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/signin");
    }
  }, [isAuthenticated, isLoading, router]);

  // DISABLED: Auto-fix was too aggressive and caused issues
  // If user has no orgs, they should manually fix via Convex dashboard or contact support
  // useEffect(() => {
  //   if (isLoading || !isAuthenticated || userOrganizations === undefined || !user) {
  //     return;
  //   }
  //   
  //   // If user has no organizations but has an email, try to fix orphaned memberships
  //   if (userOrganizations.length === 0 && user.email) {
  //     fixOrphanedMemberships({ email: user.email }).catch((err) => {
  //       // Silently fail - this is just a background fix attempt
  //       console.log("Could not fix orphaned memberships:", err);
  //     });
  //   }
  // }, [isLoading, isAuthenticated, userOrganizations, user, fixOrphanedMemberships]);

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
      <div className="flex flex-col gap-8 w-full h-screen justify-center items-center px-4">
        <div className="flex items-center gap-6">
          <Image src="/smile.png" alt="Smile Logo" width={90} height={90} />
          <div className="w-px h-20 bg-slate-300 dark:bg-slate-600"></div>
          <Image src="/sad.png" alt="Sad Logo" width={90} height={90} />
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
                <ManagerLayoutNav pathname={pathname} router={router} userRole={userRole} />
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
              <CreateOrganizationButton 
                router={router} 
                createOrganization={createOrganization}
                setSelectedOrg={setSelectedOrg}
              />
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="flex justify-end items-center p-3">
          <SignOutButtonSidebar />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <SidebarToggleButton />
        <main className="p-8 flex flex-col gap-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}

function SidebarToggleButton() {
  const { open, toggleSidebar } = useSidebar();

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

function ManagerLayoutNav({
  pathname,
  router,
  userRole
}: {
  pathname: string;
  router: AppRouterInstance;
  userRole: "owner" | "editor" | "viewer" | null | undefined;
}) {
  if (!userRole) return null;

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

  if (showForm) {
    return (
      <div className="mt-2 p-2 bg-slate-50 dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700">
        <form onSubmit={handleCreate} className="flex flex-col gap-2">
          <input
            type="text"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="Organization Name"
            className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
            required
            autoFocus
          />
          {error && (
            <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={creating || !orgName.trim()}
              className="flex-1 px-2 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50"
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
              className="px-2 py-1.5 text-xs bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-md"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <SidebarMenu className="mt-2">
      <SidebarMenuItem>
        <SidebarMenuButton
          onClick={() => setShowForm(true)}
          className="w-full text-base text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
        >
          <Plus className="size-4" />
          <span>Create Organization</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
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
