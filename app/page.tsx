import BulkUploadComponent from "@/components/bulk-upload";

export const metadata = {
  title: "Bulk User Upload Stream | Next.js",
  description:
    "Real-time streaming bulk user ingestion with live SSE progress, row validation, and failure reporting.",
};

export default function Home() {
  return (
    <div className="relative min-h-[calc(100vh-6rem)] py-8 px-4 sm:px-6 lg:px-8">
      {/* Background ambient decorative glow */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-gradient-to-tr from-blue-500/10 via-indigo-500/10 to-purple-500/10 blur-3xl rounded-full" />
      </div>

      <div className="max-w-4xl mx-auto space-y-6 text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/60">
          <span className="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-400 animate-ping" />
          Web Streams & SSE Ingestion
        </div>

        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
          Bulk User Streaming Upload
        </h1>

        <p className="max-w-2xl mx-auto text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
          Upload thousands of users with live progress streaming, chunked Web Streams API processing, instant validation checks, and automatic failure diagnostics.
        </p>
      </div>

      {/* Main Bulk Upload Interactive Component */}
      <BulkUploadComponent />
    </div>
  );
}
