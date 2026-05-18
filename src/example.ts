import { BrowserAutomationAgent } from './index';

async function main() {
  const agent = new BrowserAutomationAgent();

  const testGoal = `
    Test the GitHub login page:
    1. Navigate to https://github.com/login
    2. Verify the page contains "Sign in" text
    3. Verify the login form is visible (username and password fields)
    4. Take a screenshot of the login page
    5. Verify there is a "Forgot password?" link
  `;

  try {
    const result = await agent.run(testGoal, {
      headless: false,
      onStepStart: (step, index) => {
        console.log(`Starting step ${index + 1}: ${step.description}`);
      },
      onStepComplete: (result, index) => {
        console.log(`Completed step ${index + 1}: ${result.status}`);
      },
    });

    console.log('\n=== Final Result ===');
    console.log(`Success: ${result.success}`);
    console.log(`Report: ${result.reportPath}`);
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

main();
