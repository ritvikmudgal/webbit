/**
 * testCache.ts
 *
 * Automated verification suite for Webbit's SHA-256 LRU ExplanationCache.
 * Run with: npx ts-node testCache.ts
 */

import { ExplanationCache, CacheValue } from './src/explanation/cache';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

async function runTests() {
  console.log('🚀 Starting ExplanationCache Verification...\n');

  const cache = new ExplanationCache(5);

  // 1. SHA-256 Hashing check
  console.log('--- Test 1: SHA-256 Hash Generation ---');
  const contentA = 'function hello() { return "world"; }';
  const hashA = cache.hashContent(contentA);
  assert(typeof hashA === 'string' && hashA.length === 64, 'Generated a valid 64-character SHA-256 hex digest');
  assert(hashA === cache.hashContent(contentA), 'Deterministic hashing (same content produces identical hash)');

  // 2. Cache Miss on empty cache
  console.log('\n--- Test 2: Cache Miss Behavior ---');
  assert(cache.get(hashA) === undefined, 'Returns undefined on cache miss');
  assert(cache.size === 0, 'Initial cache size is 0');

  // 3. Cache Set & Hit
  console.log('\n--- Test 3: Cache Set & Retrieval (Hit) ---');
  const dummyValA: CacheValue = {
    agent1Response: 'File role for A',
    agent2Response: 'Function analysis for A',
    timestamp: Date.now(),
  };
  cache.set(hashA, dummyValA);
  assert(cache.size === 1, 'Cache size increments to 1 after insertion');

  const retrievedA = cache.get(hashA);
  assert(retrievedA !== undefined, 'Cache hit returns an entry');
  assert(retrievedA?.agent1Response === dummyValA.agent1Response, 'Retrieved cached agent1Response matches');
  assert(retrievedA?.agent2Response === dummyValA.agent2Response, 'Retrieved cached agent2Response matches');

  // 4. Invalidation via Content Modification
  console.log('\n--- Test 4: Content Modification / Invalidation ---');
  const modifiedContentA = 'function hello() { return "webbit"; }';
  const modifiedHashA = cache.hashContent(modifiedContentA);
  assert(hashA !== modifiedHashA, 'Modified content yields different SHA-256 hash');
  assert(cache.get(modifiedHashA) === undefined, 'Modified content naturally causes cache miss');

  // 5. LRU Eviction with 5-item capacity
  console.log('\n--- Test 5: LRU Capacity & Eviction (Max 5 items) ---');
  cache.clear();
  assert(cache.size === 0, 'Cache clears cleanly');

  // Insert 5 items: item1, item2, item3, item4, item5
  const hashes: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const h = cache.hashContent(`content file ${i}`);
    hashes.push(h);
    cache.set(h, {
      agent1Response: `agent1 response ${i}`,
      agent2Response: `agent2 response ${i}`,
      timestamp: Date.now(),
    });
  }
  assert(cache.size === 5, 'Cache reaches maximum capacity of 5');

  // Access item 1 to promote it to MRU (tail), making item 2 the LRU (oldest)
  console.log('\n--- Test 6: Access Updates LRU Position ---');
  const touch1 = cache.get(hashes[0]);
  assert(touch1 !== undefined, 'Item 1 accessed and promoted to Most Recently Used');

  // Insert 6th item -> item 2 must be evicted (since item 1 was refreshed)
  const hash6 = cache.hashContent('content file 6');
  cache.set(hash6, {
    agent1Response: 'agent1 response 6',
    agent2Response: 'agent2 response 6',
    timestamp: Date.now(),
  });

  assert(cache.size === 5, 'Cache size remains strictly capped at 5 after 6th item');
  assert(cache.get(hashes[1]) === undefined, 'Oldest untouched item (item 2) was successfully evicted');
  assert(cache.get(hashes[0]) !== undefined, 'Item 1 was preserved because it was refreshed before eviction');
  assert(cache.get(hash6) !== undefined, 'Newly inserted item 6 is present in cache');

  console.log('\n🎉 ALL CACHE TESTS COMPLETED SUCCESSFULLY! The cache is 100% ready.');
}

runTests();
