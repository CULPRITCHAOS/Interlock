/**
 * Real Pinecone Integration Test
 * ===============================
 * 
 * Tests the Interlock Pinecone adapter with ACTUAL Pinecone API calls.
 * This proves our adapter works with real infrastructure, not just mocks.
 * 
 * Prerequisites:
 * - PINECONE_API_KEY environment variable set
 * - Free tier Pinecone account (1 index allowed)
 * 
 * Usage:
 *   npx tsx scripts/real-pinecone-test.ts --vectors 1000 --queries 100
 */

import * as fs from 'fs';
import * as path from 'path';

// Parse command line arguments
const args = process.argv.slice(2);
const getArg = (name: string, defaultValue: string): string => {
    const index = args.indexOf(`--${name}`);
    return index !== -1 && args[index + 1] ? args[index + 1] : defaultValue;
};

const VECTOR_COUNT = parseInt(getArg('vectors', '1000'));
const QUERY_COUNT = parseInt(getArg('queries', '100'));
const DIMENSION = 1536; // OpenAI embedding dimension (common)
const INDEX_NAME = 'interlock-test';

// Results directory
const RESULTS_DIR = 'results/pinecone-integration';

interface PineconeTestResults {
    timestamp: string;
    vectorCount: number;
    queryCount: number;
    dimension: number;
    indexName: string;
    upsertLatencyMs: number;
    queryLatencies: {
        p50Ms: number;
        p95Ms: number;
        p99Ms: number;
        avgMs: number;
    };
    adapterMetrics: {
        latencyP95Ms: number;
        confidenceScore: number;
        operationCount: number;
    };
    isRealPinecone: true;
    success: boolean;
    actionTaken?: 'ALLOW' | 'REFUSE';
    refusalReason?: string;
    error?: string;
}

async function main() {
    console.log('='.repeat(60));
    console.log('INTERLOCK REAL PINECONE INTEGRATION TEST');
    console.log('='.repeat(60));
    console.log(`Vectors: ${VECTOR_COUNT}`);
    console.log(`Queries: ${QUERY_COUNT}`);
    console.log(`Dimension: ${DIMENSION}`);
    console.log();

    // Check for API key
    const apiKey = process.env.PINECONE_API_KEY;
    if (!apiKey) {
        console.error('❌ PINECONE_API_KEY environment variable not set');
        console.error('');
        console.error('To run this test:');
        console.error('1. Create a free Pinecone account at https://www.pinecone.io/');
        console.error('2. Get your API key from the console');
        console.error('3. Set PINECONE_API_KEY=your_key');
        process.exit(1);
    }

    console.log('✅ Pinecone API key found');
    console.log();

    // Dynamic import of Pinecone client
    let Pinecone: any;
    try {
        const pineconeModule = await import('@pinecone-database/pinecone');
        Pinecone = pineconeModule.Pinecone;
    } catch (error) {
        console.error('❌ Failed to import @pinecone-database/pinecone');
        console.error('Run: npm install @pinecone-database/pinecone');
        process.exit(1);
    }

    // Import Interlock adapter
    const { createPineconeAdapter } = await import('../adapters/pinecone/index');

    const results: Partial<PineconeTestResults> = {
        timestamp: new Date().toISOString(),
        vectorCount: VECTOR_COUNT,
        queryCount: QUERY_COUNT,
        dimension: DIMENSION,
        indexName: INDEX_NAME,
        isRealPinecone: true,
        success: false
    };

    try {
        // Initialize Pinecone client
        console.log('Initializing Pinecone client...');
        const pc = new Pinecone({ apiKey });

        // Check or create index
        console.log(`Checking for index "${INDEX_NAME}"...`);
        const indexList = await pc.listIndexes();
        const indexExists = indexList.indexes?.some((idx: any) => idx.name === INDEX_NAME);

        if (!indexExists) {
            console.log(`Creating serverless index "${INDEX_NAME}"...`);
            await pc.createIndex({
                name: INDEX_NAME,
                dimension: DIMENSION,
                metric: 'cosine',
                spec: {
                    serverless: {
                        cloud: 'aws',
                        region: 'us-east-1'
                    }
                }
            });

            // Wait for index to be ready
            console.log('Waiting for index to be ready...');
            await new Promise(resolve => setTimeout(resolve, 30000));
        }

        const index = pc.index(INDEX_NAME);

        // Create Interlock adapter
        console.log('Creating Interlock Pinecone adapter...');
        const adapter = createPineconeAdapter(0.5);

        // Generate random vectors
        console.log(`Generating ${VECTOR_COUNT} random vectors...`);
        const vectors = Array.from({ length: VECTOR_COUNT }, (_, i) => ({
            id: `vec-${i}`,
            values: Array.from({ length: DIMENSION }, () => Math.random() * 2 - 1)
        }));

        // Upsert vectors in batches
        console.log('Upserting vectors to Pinecone...');
        const upsertStart = Date.now();
        const BATCH_SIZE = 100;

        for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
            const batch = vectors.slice(i, i + BATCH_SIZE);
            await index.upsert(batch);
            if ((i + BATCH_SIZE) % 500 === 0) {
                console.log(`  Upserted ${Math.min(i + BATCH_SIZE, vectors.length)}/${vectors.length}`);
            }
        }

        const upsertTime = Date.now() - upsertStart;
        console.log(`Upsert complete in ${upsertTime}ms`);
        results.upsertLatencyMs = upsertTime;

        // Wait for vectors to be indexed
        console.log('Waiting for vectors to be indexed...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Wrap query function with Interlock adapter
        const wrappedQuery = adapter.wrapQuery(async (queryVector: number[], topK: number) => {
            const response = await index.query({
                vector: queryVector,
                topK,
                includeMetadata: false
            });
            return response;
        });

        // Run queries and measure latency
        console.log(`Running ${QUERY_COUNT} queries...`);
        const queryLatencies: number[] = [];

        for (let i = 0; i < QUERY_COUNT; i++) {
            const queryVector = Array.from({ length: DIMENSION }, () => Math.random() * 2 - 1);

            const start = Date.now();
            try {
                await wrappedQuery(queryVector, 10);
            } catch (error: any) {
                if (typeof error?.message === 'string' && error.message.includes('Interlock refusal: Confidence below quality floor')) {
                    const adapterMetrics = adapter.observe();
                    results.adapterMetrics = {
                        latencyP95Ms: adapterMetrics.latencyP95Ms,
                        confidenceScore: adapterMetrics.confidenceScore,
                        operationCount: adapterMetrics.operationCount
                    };
                    results.actionTaken = 'REFUSE';
                    results.refusalReason = error.message;
                    results.success = true;
                    console.log(`  Refusal observed at query ${i + 1}/${QUERY_COUNT}: ${error.message}`);
                    console.log(`  Confidence ${(adapterMetrics.confidenceScore * 100).toFixed(1)}% below floor - enforcement confirmed`);
                    break;
                }
                throw error;
            }
            const latency = Date.now() - start;

            queryLatencies.push(latency);

            if ((i + 1) % 25 === 0) {
                console.log(`  Completed ${i + 1}/${QUERY_COUNT} queries`);
            }
        }

        // Calculate latency percentiles
        if (queryLatencies.length > 0) {
            queryLatencies.sort((a, b) => a - b);
            const p50 = queryLatencies[Math.floor(queryLatencies.length * 0.5)];
            const p95 = queryLatencies[Math.floor(queryLatencies.length * 0.95)];
            const p99 = queryLatencies[Math.floor(queryLatencies.length * 0.99)];
            const avg = queryLatencies.reduce((a, b) => a + b, 0) / queryLatencies.length;

            results.queryLatencies = {
                p50Ms: p50,
                p95Ms: p95,
                p99Ms: p99,
                avgMs: Math.round(avg * 100) / 100
            };

            console.log();
            console.log('Query Latencies:');
            console.log(`  P50: ${p50}ms`);
            console.log(`  P95: ${p95}ms`);
            console.log(`  P99: ${p99}ms`);
            console.log(`  Avg: ${avg.toFixed(2)}ms`);
        }

        // Get adapter metrics
        const adapterMetrics = adapter.observe();
        results.adapterMetrics = {
            latencyP95Ms: adapterMetrics.latencyP95Ms,
            confidenceScore: adapterMetrics.confidenceScore,
            operationCount: adapterMetrics.operationCount
        };

        console.log();
        console.log('Adapter Metrics:');
        console.log(`  Latency P95: ${adapterMetrics.latencyP95Ms}ms`);
        console.log(`  Confidence: ${(adapterMetrics.confidenceScore * 100).toFixed(1)}%`);
        console.log(`  Operations: ${adapterMetrics.operationCount}`);

        // Cleanup: delete vectors (optional - keeps index for next run)
        // Uncomment to delete after test:
        // await index.deleteAll();

        if (!results.actionTaken) {
            results.actionTaken = 'ALLOW';
            results.success = true;
        }

        console.log();
        console.log('='.repeat(60));
        console.log('✅ REAL PINECONE INTEGRATION TEST COMPLETE');
        console.log('='.repeat(60));

    } catch (error: any) {
        console.error('❌ Test failed:', error.message);
        results.error = error.message;
        results.success = false;
    }

    // Save results
    fs.mkdirSync(RESULTS_DIR, { recursive: true });

    const resultsPath = path.join(RESULTS_DIR, 'real_pinecone_metrics.json');
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    console.log(`\nResults saved to ${resultsPath}`);

    if (results.adapterMetrics) {
        const adapterPath = path.join(RESULTS_DIR, 'adapter_metrics.json');
        fs.writeFileSync(adapterPath, JSON.stringify(results.adapterMetrics, null, 2));
    }

    process.exit(results.success ? 0 : 1);
}

main().catch(console.error);
