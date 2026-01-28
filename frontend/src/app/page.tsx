import Link from "next/link";
import { ArrowRight, FileText, MessageSquare, Search } from "lucide-react";
import { auth } from "~/server/auth";
import { redirect } from "next/navigation";

export default async function LandingPage() {
  const session = await auth();

  if (session?.user) {
    redirect("/chat");
  }

  return (
    <main className="flex min-h-screen flex-col bg-slate-950 text-white">
      {/* Navbar */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
        <div className="text-xl font-bold flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">🦜</div>
            PaperParrot
        </div>
        <div>
            <Link
                href="/api/auth/signin"
                className="rounded-full bg-blue-600 px-6 py-2 font-semibold transition hover:bg-blue-700"
            >
                Sign In
            </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <h1 className="text-5xl font-extrabold tracking-tight sm:text-[5rem] mb-6">
          Chat with your <span className="text-blue-500">Research</span>
        </h1>
        <p className="max-w-2xl text-lg text-slate-400 mb-10">
          Upload PDFs, ask questions, and get cited answers instantly. 
          PaperParrot combines vector search with internet capabilities to maintain accuracy.
        </p>
        <Link
          href="/api/auth/signin"
          className="flex items-center gap-2 rounded-full bg-white px-8 py-4 text-lg font-bold text-slate-950 transition hover:bg-slate-200"
        >
          Get Started <ArrowRight size={20} />
        </Link>
      </section>

      {/* Features */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-8 px-6 py-16 max-w-6xl mx-auto">
        <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-800">
            <div className="w-12 h-12 bg-blue-900/50 rounded-lg flex items-center justify-center mb-4 text-blue-400">
                <FileText />
            </div>
            <h3 className="text-xl font-bold mb-2">Document Analysis</h3>
            <p className="text-slate-400">Upload multiple PDF/TXT files per conversation. Isolated context ensures focused answers.</p>
        </div>
        <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-800">
            <div className="w-12 h-12 bg-purple-900/50 rounded-lg flex items-center justify-center mb-4 text-purple-400">
                <Search />
            </div>
            <h3 className="text-xl font-bold mb-2">Smart Retrieval</h3>
            <p className="text-slate-400">Powered by Neon PgVector and LlamaIndex for precise semantic search.</p>
        </div>
        <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-800">
            <div className="w-12 h-12 bg-emerald-900/50 rounded-lg flex items-center justify-center mb-4 text-emerald-400">
                <MessageSquare />
            </div>
            <h3 className="text-xl font-bold mb-2">Internet Fallback</h3>
            <p className="text-slate-400">If your documents don't have the answer, we search the web for you.</p>
        </div>
      </section>
      
      {/* Footer */}
      <footer className="mt-auto py-8 text-center text-slate-600 border-t border-slate-900">
          &copy; {new Date().getFullYear()} PaperParrot.
      </footer>
    </main>
  );
}
