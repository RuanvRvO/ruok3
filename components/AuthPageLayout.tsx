import Image from "next/image";
import Link from "next/link";

interface AuthPageLayoutProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  showLogos?: boolean;
  backLink?: {
    href: string;
    text: string;
  };
}

export function AuthPageLayout({
  title,
  subtitle,
  children,
  showLogos = true,
  backLink,
}: AuthPageLayoutProps) {
  return (
    <div className="flex flex-col gap-4 sm:gap-6 md:gap-8 w-full max-w-lg mx-auto min-h-screen justify-center items-center px-4 py-8">
      <div className="text-center flex flex-col items-center gap-2 sm:gap-3 md:gap-4">
        <h1 className="text-2xl sm:text-3xl md:text-3xl font-bold text-slate-800 dark:text-slate-200">
          {title}
        </h1>
        {showLogos && (
          <div className="flex items-center gap-3 sm:gap-4 md:gap-6">
            <Image
              src="/smile.png"
              alt="Smile Logo"
              width={60}
              height={60}
              className="w-14 h-14 sm:w-20 sm:h-20 md:w-24 md:h-24"
            />
            <div className="w-px h-12 sm:h-16 md:h-20 bg-slate-300 dark:bg-slate-600"></div>
            <Image
              src="/sad.png"
              alt="Sad Logo"
              width={55}
              height={55}
              className="w-12 h-12 sm:w-18 sm:h-18 md:w-[90px] md:h-[90px]"
            />
          </div>
        )}
        {subtitle && (
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400">
            {subtitle}
          </p>
        )}
      </div>

      {children}

      {backLink && (
        <Link
          href={backLink.href}
          className="text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 text-sm sm:text-base transition-colors underline underline-offset-2 py-2"
        >
          {backLink.text}
        </Link>
      )}
    </div>
  );
}
