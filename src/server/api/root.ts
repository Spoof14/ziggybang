import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";
import { listingsRouter } from "./routers/listings";
import { postRouter } from "~/server/api/routers/post";

export const appRouter = createTRPCRouter({
  post: postRouter,
  listings: listingsRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
