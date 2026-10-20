import Link from "next/link";
import {blogPosts} from "@/app/blog/data";



export default function BlogListPage (){
    return(
        <div className="max-w-4xl mx-auto px-4 py-12">
            <header className="mb-10">
                <h1>Technology Blog</h1>
                <p>
                    Thoughts, guides, and insights on moderm web development and software engineering.
                </p>
            </header>

            <hr className="border-gray-200 my-8" />

            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                {blogPosts.map((post) => (
                    <article
                        key={post.id}
                        className="flex flex-col justify-between p-6 bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-200"
                    >
                        <div>
              <span className="text-xs font-semibold text-blue-600 tracking-wider uppercase">
                {post.date}
              </span>
                            <h2 className="mt-2 text-xl font-bold text-gray-900 line-clamp-2">
                                {post.title}
                            </h2>
                            <p className="mt-3 text-sm text-gray-600 line-clamp-3">
                                {post.description}
                            </p>
                        </div>

                        <div className="mt-6">
                            <Link
                                href={`/blog/${post.id}`}
                                className="inline-flex items-center text-sm font-semibold text-blue-600 hover:text-blue-500"
                            >
                                Read Article
                                <svg className="w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </Link>
                        </div>
                    </article>
                ))}
            </div>

        </div>
    )
}