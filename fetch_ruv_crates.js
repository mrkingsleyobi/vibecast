#!/usr/bin/env node

/**
 * Fetch all crates from ruvnet on crates.io
 * Usage: node fetch_ruv_crates.js
 */

async function fetchRuvCrates() {
  const allCrates = [];
  let page = 1;
  const perPage = 100;
  const userId = 40869; // ruvnet's user ID

  console.log('Fetching all crates from ruvnet on crates.io...\n');

  while (true) {
    const url = `https://crates.io/api/v1/crates?user_id=${userId}&per_page=${perPage}&page=${page}`;

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'vibecast-crate-fetcher (github.com/ruvnet/vibecast)'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.crates || data.crates.length === 0) {
        break;
      }

      allCrates.push(...data.crates);
      console.log(`Page ${page}: Found ${data.crates.length} crates`);

      // Check if we've got all pages
      if (data.crates.length < perPage) {
        break;
      }

      page++;

      // Be nice to the API
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (error) {
      console.error(`Error fetching page ${page}:`, error.message);
      break;
    }
  }

  console.log(`\n✓ Total crates found: ${allCrates.length}\n`);

  // Sort by name
  allCrates.sort((a, b) => a.name.localeCompare(b.name));

  // Print all crate names
  console.log('=== ALL CRATES ===\n');
  allCrates.forEach((crate, index) => {
    console.log(`${index + 1}. ${crate.name} (${crate.max_version || 'unknown version'})`);
  });

  // Save to file
  const fs = require('fs');
  const output = {
    total: allCrates.length,
    fetched_at: new Date().toISOString(),
    crates: allCrates.map(c => ({
      name: c.name,
      version: c.max_version,
      description: c.description,
      downloads: c.downloads,
      created_at: c.created_at,
      updated_at: c.updated_at
    }))
  };

  fs.writeFileSync('ruv_crates_list.json', JSON.stringify(output, null, 2));
  console.log('\n✓ Saved to ruv_crates_list.json');

  return allCrates;
}

// Run the script
fetchRuvCrates().catch(console.error);
