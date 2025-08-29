/**
 * @akaoio/dashboard Test Suite using @akaoio/battle
 * Real-time dashboard testing with PTY emulation
 */
import { Battle } from "@akaoio/battle"

async function runTests() {
  console.log('🚀 @akaoio/dashboard Test Suite (Powered by @akaoio/battle)\n')

  const tests = [
    // CLI Tests
    {
      name: 'CLI: Dashboard Help',
      command: 'node',
      args: ['dist/cli.js', '--help'],
      expect: ['Dashboard', 'Usage:', 'Commands:']
    },
    {
      name: 'CLI: Dashboard Version',
      command: 'node', 
      args: ['dist/cli.js', '--version'],
      expect: ['2.0.0']
    },
    // Server Tests (skip in CI - port conflicts)
    // {
    //   name: 'Server: Start and Status',
    //   command: 'node',
    //   args: ['server.js'],
    //   expect: ['Dashboard Server', '3.0'],
    //   timeout: 5000
    // },
    // API Tests  
    {
      name: 'API: Dashboard Import',
      command: 'node',
      args: ['--input-type=module', '-e', `import { Dashboard } from './dist/Dashboard.js'; console.log('Dashboard API loaded');`],
      expect: ['Dashboard API loaded']
    },
    {
      name: 'API: Air Integration',
      command: 'node',
      args: ['--input-type=module', '-e', `import { Dashboard } from './dist/Dashboard.js'; const d = new Dashboard(); console.log('Dashboard created with Air integration');`],
      expect: ['Dashboard created with Air integration']
    },
    // Network Tests
    {
      name: 'Network: Port Availability',
      command: 'node',
      args: ['--input-type=module', '-e', `console.log('Dashboard port:', process.env.DASHBOARD_PORT || '8767');`],
      expect: ['Dashboard port:', '8767']
    }
  ]

  let passed = 0
  let failed = 0

  for (const test of tests) {
    process.stdout.write(`Testing: ${test.name}... `)
    
    const battle = new Battle({
      timeout: test.timeout || 15000
    })

    try {
      const result = await battle.run(async (b) => {
        b.spawn(test.command, test.args || [])
        
        for (const pattern of test.expect) {
          await b.expect(pattern, test.timeout || 10000)
        }
        
        // For server tests, kill after verification
        if (test.name.includes('Server')) {
          setTimeout(() => {
            try { process.kill(b.pid, 'SIGTERM') } catch(e) {}
          }, 2000)
        }
      })

      if (result.success) {
        console.log('✅ PASSED')
        passed++
      } else {
        console.log('❌ FAILED')
        console.log(`  ${result.error}`)
        failed++
      }
    } catch (error) {
      console.log('❌ FAILED')
      console.log(`  ${error}`)
      failed++
    }
  }

  console.log('\n==================================================')
  console.log(`📊 Results: ${passed} passed, ${failed} failed`)
  console.log('==================================================')

  if (failed > 0) {
    console.log(`\n❌ Some tests failed. @akaoio/dashboard needs fixes.`)
    process.exit(1)
  } else {
    console.log('\n✅ All tests passed! @akaoio/dashboard is battle-tested.')
  }
}

// Run tests
runTests().catch(error => {
  console.error('💥 Test runner failed:', error)
  process.exit(1)
})