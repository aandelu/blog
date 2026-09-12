import { defineCollection, reference } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const authors = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/authors' }),
  schema: z.object({
    name: z.string(),
    bio: z.string().default(''),
    // Used for the small mark next to the pen name.
    color: z.string().default('#5F5A51'),
  }),
});

const essays = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/essays' }),
  schema: z.object({
    title: z.string(),
    dek: z.string().optional(),
    author: reference('authors'),
    date: z.coerce.date(),
    bookTitle: z.string().optional(),
    bookAuthor: z.string().optional(),
    // Slug (file name without .md) of the essay this one answers.
    replyTo: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { authors, essays };
