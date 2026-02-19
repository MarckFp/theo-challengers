const { expect } = require('@playwright/test');

// Brutally remove all modals locally
async function brutalCleanup(page) {
  try {
    await page.evaluate(() => {
      // Remove 'modal-open' class from everything
      document.querySelectorAll('.modal-open').forEach(el => el.classList.remove('modal-open'));
      
      // Close all dialogs but DO NOT remove them if they are part of the app structure
      document.querySelectorAll('dialog').forEach(d => {
        try { d.close(); } catch(e){}
        d.removeAttribute('open'); 
        
        // Only force hide nicely if it's likely a nuisance modal
        const text = d.textContent || "";
        if (text.includes("Weekly Bonus") || text.includes("Welcome!")) {
             d.style.display = 'none'; // Force hide the clutter
        } else {
             // For others, just closing should be enough.
             d.style.removeProperty('display');
        }
      });
      
      // Remove modal backdrops
      document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
    });
  } catch(e) {
    // Ignore errors
  }
}

// Helper to get past tutorial and daily bonus
async function completeTutorial(page) {
  // 1. Tutorial
  try {
      const tutorialDialog = page.locator('.modal').filter({ hasText: 'Welcome!' });
      
      for (let i = 0; i < 5; i++) {
           if (await tutorialDialog.isVisible({ timeout: 1000 })) {
              for (let j = 0; j < 10; j++) {
                  const btn = tutorialDialog.getByRole('button', { name: /Next|Let's Play!/i }).first();
                  if (!(await btn.isVisible())) break;

                  const text = await btn.innerText();
                  
                  if (text.includes("Let's Play")) {
                      await btn.click({ force: true });
                      await expect(tutorialDialog).not.toBeVisible({ timeout: 2000 });
                      break;
                  } else {
                      await btn.click({ force: true });
                      await page.waitForTimeout(300); 
                  }
              }
              await expect(tutorialDialog).not.toBeVisible(); 
           }
           await page.waitForTimeout(500);
      }

      await brutalCleanup(page);

  } catch (e) {
      // Assume no tutorial or dismissed
  }

  await brutalCleanup(page);
  await page.waitForTimeout(200);
}

// Helper to click tabs
async function clickTab(page, index) {
    const mobileBtn = page.locator('.fixed.bottom-4 button').nth(index);
    if (await mobileBtn.isVisible()) {
        await mobileBtn.click({ force: true });
        await expect(mobileBtn).toHaveClass(/btn-primary/);
        return;
    }
    
    const desktopBtn = page.locator('.hidden.md\\:flex button').nth(index);
    if (await desktopBtn.isVisible()) {
        await desktopBtn.dispatchEvent('click');
        
        try {
           await expect(desktopBtn).toHaveClass(/bg-primary/, { timeout: 2000 });
        } catch(e) {
           console.log(`Tab click failed on attempt 1 for index ${index}, retrying with force click...`);
           await desktopBtn.click({ force: true });
           await expect(desktopBtn).toHaveClass(/bg-primary/); 
        }
        return;
    }

    throw new Error(`Tab at index ${index} not found`);
}

// Helper to seed coins
async function seedCoins(page, amount) {
    return await page.evaluate((coins) => {
         return new Promise((resolve) => {
             const openReq = indexedDB.open('theochallenguers');
             openReq.onsuccess = (e) => {
                 try {
                     const db = e.target.result;
                     const tx = db.transaction(['player'], 'readwrite');
                     const store = tx.objectStore('player');
                     const getReq = store.getAll();
                     getReq.onsuccess = () => {
                         const players = getReq.result;
                         if (players && players.length > 0) {
                             const p = players[0];
                             p.coins = coins;
                             if (!p.tutorialSeen) p.tutorialSeen = true; 
                             if (!p.bonusSeen) p.bonusSeen = true; 
                             
                             store.put(p);
                             tx.oncomplete = () => resolve(true);
                         } else {
                             resolve(false);
                         }
                     };
                 } catch(e) { resolve(false); }
             };
             openReq.onerror = () => resolve(false);
         });
    }, amount);
}

// Helper to seed inventory
async function seedInventory(page, itemData = {}) {
    return await page.evaluate((data) => {
         return new Promise((resolve) => {
             const openReq = indexedDB.open('theochallenguers');
             openReq.onsuccess = (e) => {
                 try {
                     const db = e.target.result;
                     const tx = db.transaction(['player', 'inventory'], 'readwrite');
                     const pStore = tx.objectStore('player');
                     const iStore = tx.objectStore('inventory');
                     
                     const pReq = pStore.getAll();
                     pReq.onsuccess = () => {
                        if (pReq.result && pReq.result.length > 0) {
                            const p = pReq.result[0];
                            if (!p.tutorialSeen) { p.tutorialSeen = true; pStore.put(p); }
                            
                            iStore.put({
                                player_id: p.id,
                                title: data.title || "challenges.generic_challenge.title",
                                description: data.description || "Generic desc",
                                points: data.points || 5,
                                cost: data.cost || 1,
                                icon: data.icon || "🥊"
                            });
                            
                            tx.oncomplete = () => resolve(true);
                        } else resolve(false);
                     };
                 } catch(e) { resolve(false); }
             };
             openReq.onerror = () => resolve(false);
         });
    }, itemData);
}

module.exports = {
    completeTutorial,
    clickTab,
    brutalCleanup,
    seedCoins,
    seedInventory
};