import { z } from "zod";
import { getListingDetail, getMapData } from "~/server/listings/aggregate";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

const boundsSchema = z.object({
  south: z.number(),
  west: z.number(),
  north: z.number(),
  east: z.number(),
});

const sourceSchema = z.enum(["zigbang", "naver"]);
const propertyTypeSchema = z.enum([
  "oneroom",
  "villa",
  "officetel",
  "apartment",
]);

export const listingsRouter = createTRPCRouter({
  getMap: publicProcedure
    .input(
      z.object({
        bounds: boundsSchema,
        zoom: z.number().min(1).max(20),
        sources: z.array(sourceSchema).min(1),
        propertyTypes: z.array(propertyTypeSchema).min(1),
      }),
    )
    .query(({ input }) => getMapData(input)),

  getDetail: publicProcedure
    .input(
      z.object({
        source: sourceSchema,
        sourceId: z.string().min(1),
        propertyType: propertyTypeSchema,
      }),
    )
    .query(({ input }) => getListingDetail(input)),
});
