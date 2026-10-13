declare const process: { env: { TEST_URL?: string } };

import { test, expect } from '@playwright/test';

test.describe('QuizGuard Real-Time Examination & Proctoring Suite', () => {
  test('Student link loads a cached assessment instead of staying on the loader', async ({ page, baseURL }) => {
    const targetUrl = process.env.TEST_URL || baseURL || 'http://localhost:5173';
    const quizId = 'loader-regression-fixture';
    const quiz = {
      id: quizId,
      hostEmail: 'fixture@test.edu',
      title: 'Loader Regression Assessment',
      createdAt: new Date().toISOString(),
      mode: 'classic',
      pacingMode: 'manual',
      theme: 'slate',
      questions: [{
        id: 'question-1',
        type: 'mcq',
        text: 'Fixture question',
        options: ['A', 'B', 'C', 'D'],
        correctAnswer: 0,
      }],
      status: 'live',
      participants: {},
    };

    await page.addInitScript(({ id, savedQuiz }) => {
      localStorage.setItem(`quizguard_quiz_${id}`, JSON.stringify(savedQuiz));
    }, { id: quizId, savedQuiz: quiz });

    await page.goto(`${targetUrl}?quiz=${quizId}`);
    await expect(page.getByText(quiz.title, { exact: true })).toBeVisible({ timeout: 5000 });
  });

  test('Classic mode gives one minute per question and keeps results visible after Close', async ({ page, baseURL }) => {
    const targetUrl = process.env.TEST_URL || baseURL || 'http://localhost:5173';
    const quizId = 'classic-mode-timer-fixture';
    const quiz = {
      id: quizId,
      hostEmail: 'fixture@test.edu',
      title: 'Classic Timer Assessment',
      createdAt: new Date().toISOString(),
      mode: 'classic',
      pacingMode: 'manual',
      theme: 'slate',
      questions: [
        { id: 'question-1', type: 'mcq', text: 'First fixture question', options: ['A', 'B', 'C', 'D'], correctAnswer: 0 },
        { id: 'question-2', type: 'mcq', text: 'Second fixture question', options: ['A', 'B', 'C', 'D'], correctAnswer: 1 },
      ],
      status: 'live',
      participants: {},
    };

    await page.addInitScript(({ id, savedQuiz }) => {
      localStorage.setItem(`quizguard_quiz_${id}`, JSON.stringify(savedQuiz));
    }, { id: quizId, savedQuiz: quiz });

    await page.goto(`${targetUrl}?quiz=${quizId}`);
    await expect(page.getByText(/Classic Proctored Assessment.*1 Minute per Question/)).toBeVisible();
    await page.getByRole('textbox').fill('Timer Test Participant');
    await page.getByRole('button', { name: /Enter Fullscreen & Start Exam/i }).click();

    await expect(page.getByText('01:00')).toBeVisible();
    await page.getByRole('button', { name: 'Submit Quiz' }).click();
    await page.getByRole('button', { name: /Confirm Final Submit/i }).click();

    await expect(page.getByText('Assessment results for Timer Test Participant')).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByText('Timer Test Participant', { exact: true })).toBeVisible();
    await expect(page.getByText('THANK YOU!')).toHaveCount(0);
  });

  test('Host-Student dual sync, live scores, strikes, and submission', async ({ browser, baseURL }) => {
    const targetUrl = process.env.TEST_URL || baseURL || 'http://localhost:5173';

    // 1. Launch two separate browser contexts
    const hostContext = await browser.newContext();
    const studentContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const studentPage = await studentContext.newPage();

    // --- PHASE 1: HOST LAUNCHES EXAM ---
    await hostPage.goto(targetUrl);

    // Open Host / Faculty portal
    const facultyPortalBtn = hostPage.getByRole('heading', { name: 'Faculty & Proctor Portal' }).first();
    if (await facultyPortalBtn.isVisible()) {
      await facultyPortalBtn.click();
    }

    // Auto-login or register if prompted
    const registerTab = hostPage.getByRole('button', { name: 'Register' });
    if (await registerTab.isVisible()) {
      await registerTab.click();
      await hostPage.locator('input[placeholder="Prof. John Doe"]').fill('Playwright Host');
      const testEmail = `host_${Date.now()}@test.edu`;
      await hostPage.locator('input[type="email"]').fill(testEmail);
      await hostPage.locator('input[placeholder="Create secure password"]').fill('TestPass123!');
      
      const captchaText = await hostPage.locator('.select-none.font-mono').innerText();
      await hostPage.locator('input[placeholder="Enter characters above"]').fill(captchaText.trim());
      await hostPage.getByRole('button', { name: 'Create Faculty Account' }).click();

      // Wait for registration redirect and login
      await hostPage.waitForTimeout(1800);
      await hostPage.locator('input[type="email"]').fill(testEmail);
      await hostPage.locator('input[type="password"]').fill('TestPass123!');
      await hostPage.getByRole('button', { name: 'Sign In to Faculty Portal' }).click();
    }

    // Ensure Host Dashboard is loaded
    await expect(hostPage.getByText(/Faculty Assessment Studio/i)).toBeVisible({ timeout: 10000 });

    // Fill assessment title and question
    const examTitle = `Automated E2E Test ${Date.now()}`;
    await hostPage.locator('input[placeholder*="Distributed Systems"]').fill(examTitle);

    await hostPage.locator('textarea').fill('What does PBFT stand for?');
    await hostPage.locator('input[placeholder="Enter Option A"]').fill('Practical Byzantine Fault Tolerance');
    await hostPage.locator('input[placeholder="Enter Option B"]').fill('Private Blockchain Fast Test');
    await hostPage.locator('input[placeholder="Enter Option C"]').fill('Public Block File Transfer');
    await hostPage.locator('input[placeholder="Enter Option D"]').fill('Peer Byzantine File Tool');
    
    // Select Option A as correct
    await hostPage.locator('input[name="correctOption"]').nth(0).check();
    await hostPage.getByRole('button', { name: /Append Question to Assessment/i }).click();

    // Launch assessment
    await hostPage.getByRole('button', { name: /Launch Assessment & Generate Link/i }).click();
    await expect(hostPage.getByText(/Live Examination Active/i)).toBeVisible({ timeout: 10000 });

    // Grab the generated student link
    const linkInput = hostPage.locator('input.select-all');
    await expect(linkInput).toBeVisible();
    const studentUrl = await linkInput.inputValue();
    expect(studentUrl).toContain('?quiz=');

    // --- PHASE 2: STUDENT JOINS ---
    await studentPage.goto(studentUrl);
    await expect(studentPage.getByText(examTitle)).toBeVisible({ timeout: 10000 });

    const candidateName = 'Automated Candidate 01';
    await studentPage.locator('input[type="text"]').fill(candidateName);
    await studentPage.getByRole('button', { name: /Enter Fullscreen & Start Exam/i }).click();

    await expect(studentPage.getByText('What does PBFT stand for?')).toBeVisible({ timeout: 10000 });

    // --- PHASE 3: LIVE SCOREBOARD SYNC ---
    // Candidate selects the correct answer
    await studentPage.getByRole('button', { name: /Practical Byzantine Fault Tolerance/i }).click();

    // Target the candidate specifically inside the scoreboard table and check for 2 / 2 pts
    await expect(hostPage.locator('table').getByText(candidateName)).toBeVisible({ timeout: 10000 });
    await expect(hostPage.locator('table').getByText(/2 \/ 2 pts/i)).toBeVisible({ timeout: 10000 });

    // --- PHASE 4: PROCTOR TRIGGER ---
    // Simulate tab switch / blur
    await studentPage.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(studentPage.getByText(/1\/3 Strikes/i)).toBeVisible({ timeout: 5000 });

    // --- PHASE 5: SUBMISSION & THANK YOU SCREEN ---
    await studentPage.getByRole('button', { name: /Submit Quiz/i }).click();
    await studentPage.getByRole('button', { name: /Confirm Final Submit/i }).click();

    // 5-second countdown bar check
    // Click Close button to view Thank You screen
    const closeBtn = studentPage.getByRole('button', { name: /Close/i });
    await expect(closeBtn).toBeVisible({ timeout: 5000 });
    await closeBtn.click();

    // Final celebration screen check
    await expect(studentPage.getByText('THANK YOU!')).toBeVisible({ timeout: 8000 });

    // Confirm score, completion time, and retake button are NOT present on Thank You screen
    const thankYouContainer = studentPage.locator('text=THANK YOU!').locator('..').locator('..');
    await expect(thankYouContainer.getByText(/Final Score/i)).toHaveCount(0);
    await expect(thankYouContainer.getByText(/Time Taken/i)).toHaveCount(0);
    await expect(thankYouContainer.getByRole('button', { name: /Retake/i })).toHaveCount(0);

    // Host status check in the scoreboard table
    await expect(hostPage.locator('table').getByText('Completed')).toBeVisible({ timeout: 5000 });

    await hostContext.close();
    await studentContext.close();
  });
});
