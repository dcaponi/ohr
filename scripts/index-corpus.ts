import "dotenv/config";
import { indexCorpus } from "@/lib/indexer";

/**
 * CLI corpus indexer: npm run index
 * Requires OPENAI_API_KEY (embeddings) and a running DB with the manifest seeded.
 */
async function main() {
  console.log("Indexing corpus…");
  const results = await indexCorpus();
  const total = results.reduce((n, r) => n + r.chunkCount, 0);
  for (const r of results) {
    console.log(`  ${r.driveFileId}  v${r.version}  ${r.chunkCount} chunks  ${r.title}`);
  }
  console.log(`✓ indexed ${results.length} documents, ${total} chunks`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
