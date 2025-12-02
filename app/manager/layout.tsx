"use client";

import { useConvexAuth, useQuery, useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter, usePathname } from "next/navigation";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { useEffect } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";
import { Eye, Edit, LogOut, Users, UserCog } from "lucide-react";
import { api } from "../../convex/_generated/api";

export default function ManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const router = useRouter();
  const pathname = usePathname();
  const user = useQuery(api.users.getCurrentUser);
  const migrateUserRole = useMutation(api.users.migrateUserRole);

  // Redirect to sign in if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/signin");
    }
  }, [isAuthenticated, isLoading, router]);

  // Migrate legacy users who have organization but no role
  useEffect(() => {
    const migrate = async () => {
      if (user && user.needsMigration) {
        console.log("Migrating user role...", user);
        try {
          const result = await migrateUserRole();
          console.log("Migration result:", result);
        } catch (error) {
          console.error("Migration failed:", error);
        }
      }
    };
    void migrate();
  }, [user, migrateUserRole]);

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
          <div className="flex items-center gap-3 p-2">
            <Image src="/smile.png" alt="Smile Logo" width={32} height={32} />
            <div className="w-px h-8 bg-slate-300 dark:bg-slate-600"></div>
            <Image
              src="/sad.png"
              alt="Sad Logo"
              width={32}
              height={32}
              className="dark:hidden"
            />
          </div>
          <h1 className="font-semibold text-slate-800 dark:text-slate-200 px-2">
            R u OK today?
          </h1>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => router.push("/manager/view")}
                    isActive={pathname === "/manager/view"}
                  >
                    <Eye className="size-4" />
                    <span>View Organization</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <ManagerLayoutNav pathname={pathname} router={router} />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
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

function ManagerLayoutNav({ pathname, router }: { pathname: string; router: AppRouterInstance }) {
  const user = useQuery(api.users.getCurrentUser);

  if (!user) return null;

  const canEdit = user.role === "owner" || user.role === "editor";
  const isOwner = user.role === "owner";

  return (
    <>
      {canEdit && (
        <SidebarMenuItem>
          <SidebarMenuButton
            onClick={() => router.push("/manager/edit")}
            isActive={pathname === "/manager/edit"}
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
        >
          <UserCog className="size-4" />
          <span>Account Settings</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </>
  );
}

function SignOutButtonSidebar() {
  const { signOut } = useAuthActions();
  const router = useRouter();
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          onClick={() =>
            void signOut().then(() => {
              router.push("/signin");
            })
          }
        >
          <LogOut className="size-4" />
          <span>Sign Out</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
