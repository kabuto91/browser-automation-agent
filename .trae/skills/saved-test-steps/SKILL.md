---
name: "saved-test-steps"
description: "Saves and reuses successful test steps. Invoke when test steps complete successfully or user wants to reuse saved test steps."
---

# Saved Test Steps

This skill manages the saving and reuse of successful browser automation test steps.

## Features

- **Save successful test steps**: Automatically or manually save steps that executed successfully
- **Load saved steps**: Reuse previously saved test steps in new test runs
- **Step library management**: View, edit, and delete saved test steps
- **Smart suggestions**: Suggest relevant saved steps based on test goals

## When to Use

Invoke this skill when:
1. A test step executes successfully and should be saved for future use
2. User wants to reuse previously saved test steps
3. User asks to manage their test step library
4. User wants to create test templates from successful executions

## Usage

### Saving a Test Step

When a test step completes successfully, you can save it with:

```typescript
{
  "action": "save",
  "step": {
    "name": "GitHub Login",
    "description": "Login to GitHub with credentials",
    "steps": [
      { "type": "navigate", "url": "https://github.com/login" },
      { "type": "type", "selector": "#login_field", "text": "${username}" },
      { "type": "type", "selector": "#password", "text": "${password}" },
      { "type": "click", "selector": "input[type='submit']" }
    ],
    "tags": ["github", "login", "authentication"]
  }
}
```

### Loading Saved Steps

To load and use saved steps:

```typescript
{
  "action": "load",
  "query": "github login",
  "tags": ["authentication"]
}
```

### Listing All Saved Steps

```typescript
{
  "action": "list"
}
```

### Deleting a Saved Step

```typescript
{
  "action": "delete",
  "stepId": "step-123"
}
```

## Data Structure

Saved test steps are stored in `.trae/skills/saved-test-steps/steps.json`:

```json
{
  "steps": [
    {
      "id": "step-123",
      "name": "GitHub Login",
      "description": "Login to GitHub with credentials",
      "createdAt": "2024-01-15T10:30:00Z",
      "lastUsed": "2024-01-20T14:22:00Z",
      "useCount": 5,
      "steps": [...],
      "tags": ["github", "login"],
      "variables": ["username", "password"]
    }
  ]
}
```

## Integration

This skill integrates with:
- **Dynamic Executor**: Automatically suggests relevant saved steps during execution
- **Static Planner**: Can include saved steps in generated test plans
- **Frontend UI**: Provides UI for managing saved steps

## Best Practices

1. **Use descriptive names**: Name steps clearly so they're easy to find later
2. **Add relevant tags**: Tags help in searching and filtering steps
3. **Parameterize variables**: Use `${variable}` syntax for reusable values
4. **Keep steps atomic**: Each saved step should do one thing well
5. **Update regularly**: Keep saved steps up-to-date with website changes
