import test from 'tape'
import getNodeModifierIds from '../getNodeModifierIds'

test('(Selector) getNodeModifierIds (input type "audio")', (t) => {
  const state = {
    nodes: {
      xxx: {
        input: {
          id: 'BAR',
          type: 'audio'
        },
        modifierIds: ['mod1', 'mod2']
      },
      mod1: {
        type: 'audio',
        id: 'mod1'
      },
      mod2: {
        id: 'mod2'
      }
    }
  }

  const actual = getNodeModifierIds(state, 'xxx')

  t.deepEqual(actual, ['mod1', 'mod2'], 'Returns all modifier Ids')
  t.end()
})

test('(Selector) getNodeModifierIds (input type "foo")', (t) => {
  const state = {
    nodes: {
      xxx: {
        input: {
          id: 'BAR',
          type: 'foo'
        },
        modifierIds: ['mod1', 'mod2']
      },
      mod1: {
        type: 'audio',
        id: 'mod1'
      },
      mod2: {
        id: 'mod2'
      }
    }
  }

  const actual = getNodeModifierIds(state, 'xxx')

  t.deepEqual(actual, ['mod2'], 'Filters out modifier with audio type')
  t.end()
})

test('(Selector) getNodeModifierIds (no input)', (t) => {
  const state = {
    nodes: {
      xxx: {
        modifierIds: ['mod1', 'mod2']
      },
      mod1: {
        type: 'audio',
        id: 'mod1'
      },
      mod2: {
        id: 'mod2'
      }
    }
  }

  const actual = getNodeModifierIds(state, 'xxx')

  t.equal(actual, undefined, 'Returns undefined')
  t.end()
})

test('(Selector) getNodeModifierIds (node type "shot" input type audio)', (t) => {
  const state = {
    nodes: {
      xxx: {
        type: 'shot',
        input: {
          id: 'BAR',
          type: 'audio'
        },
        modifierIds: ['mod1', 'mod2', 'mod3']
      },
      mod1: {
        key: 'gain',
        id: 'mod1'
      },
      mod2: {
        key: 'foo',
        id: 'mod2'
      },
      mod3: {
        key: 'bar',
        id: 'mod3'
      }
    }
  }

  const actual = getNodeModifierIds(state, 'xxx')

  t.deepEqual(actual, ['mod1'], 'Only returns gain modifier')
  t.end()
})

test('(Selector) getNodeModifierIds (node type "shot" input type not audio)', (t) => {
  const state = {
    nodes: {
      xxx: {
        type: 'shot',
        input: {
          id: 'BAR',
          type: 'foo'
        },
        modifierIds: ['mod1', 'mod2', 'mod3']
      },
      mod1: {
        key: 'gain',
        id: 'mod1'
      },
      mod2: {
        key: 'foo',
        id: 'mod2'
      },
      mod3: {
        key: 'bar',
        id: 'mod3'
      }
    }
  }

  const actual = getNodeModifierIds(state, 'xxx')

  t.equal(actual, undefined, 'Returns undefined')
  t.end()
})
