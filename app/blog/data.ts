interface blogPostType {
    id: string;
    title: string;
    description: string;
    date: string;
}

export const blogPosts: blogPostType[] = [
    {
        id: 'nextjs-15',
        title: 'What is New in Next.js 15',
        description: 'Exploring async params, compiler updates, and speed improvements.',
        date: 'May 28, 2026 qqq'
    },
    {
        id: 'typescript-tips',
        title: '5 TypeScript Tricks You Need',
        description: 'Level up your codebase with advanced utility types and strict type safety.',
        date: 'June 01, 2026'
    },
    {
        id: 'ai-in-2026',
        title: 'The State of AI in 2026',
        description: 'How local AI models and specialized agents are changing software development.',
        date: 'June 03, 2026'
    },
];
