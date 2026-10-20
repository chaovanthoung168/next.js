import {blogPosts} from "@/app/blog/data";
import {notFound} from "next/navigation";

type Props = {
    params: Promise<{id : string}>;
}

export default async function BlogPostPage ({
    params
                                            }: Props
){
    const {id} = await params;

    const post = blogPosts.find((p) => p.id == id)

    if (!post) {notFound()}

    return (
        <div className="p-8">
            <h1 className="text-3xl font-bold">{post.title}</h1>
            <p className="mt-4">{post.description}</p>
        </div>
    )
}