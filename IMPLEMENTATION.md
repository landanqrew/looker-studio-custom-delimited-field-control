# Delimited Field Control - Implementation Guide

## Overview

This Looker Studio community visualization provides a multi-select dropdown control for filtering delimited text fields. It's perfect for fields containing comma-separated or otherwise delimited values.

## Use Case Example

**Data:**
```
| Fruits                        |
|-------------------------------|
| apples, grapes                |
| oranges                       |
| bananas, apples               |
| grapes, oranges, kiwi         |
| apples, bananas, strawberries |
```

**Control Output:**
Multi-select dropdown with options:
- ☐ apples
- ☐ bananas  
- ☐ grapes
- ☐ kiwi
- ☐ oranges
- ☐ strawberries

**Filtering Behavior:**
When you select "apples" and "bananas", it filters to rows containing **either** value:
- ✅ "apples, grapes" (contains apples)
- ❌ "oranges" (contains neither)
- ✅ "bananas, apples" (contains both)
- ❌ "grapes, oranges, kiwi" (contains neither)
- ✅ "apples, bananas, strawberries" (contains both)

## Key Features

### 1. **Automatic Value Extraction**
- Parses delimited values from your data
- Extracts and displays unique options
- Handles whitespace trimming
- Supports custom delimiters

### 2. **Multi-Select Filtering**
- Select multiple values at once
- "Select All" and "Clear All" buttons
- Checkbox interface for easy interaction
- Shows selected count

### 3. **Smart Filtering Logic**
- Uses `indexOf()` to check if raw value contains selected option
- Filters rows where field contains **ANY** selected value (OR logic)
- Works with the actual raw data, not split values

### 4. **State Preservation**
- Maintains selections across re-renders
- Survives when other filters are applied
- Prevents losing selections when Looker Studio updates

### 5. **Performance Optimizations**
- Deduplication prevents infinite filter loops
- Only sends filter when selections actually change
- Efficient string matching

## Configuration

### Required Settings

**Delimited Dimension** (Data section):
- Select the dimension field containing delimited values
- Must select exactly 1 field
- Works with TEXT type fields

**Delimiter** (Style section):
- Default: `,` (comma)
- Can be changed to any delimiter:
  - `;` for semicolon-separated
  - `|` for pipe-separated
  - ` ` for space-separated
  - etc.

### Optional Style Settings

- **Font Color**: Text color for options
- **Font Family**: Font family for the control
- **Background Color**: Background color of the container
- **Border Radius**: Rounded corners (in px)
- **Opacity**: Transparency of the control

## How It Works

### Step 1: Data Extraction

```javascript
// Example data row: "apples, grapes"
const rawValue = row.delimitedDimension[0]; // "apples, grapes"

// Split by delimiter
const parts = rawValue.split(','); // ["apples", " grapes"]

// Trim whitespace
const trimmed = parts.map(p => p.trim()); // ["apples", "grapes"]

// Collect unique values across all rows
uniqueValues = ["apples", "bananas", "grapes", "kiwi", "oranges", "strawberries"]
```

### Step 2: User Selection

User checks boxes for "apples" and "bananas":
```javascript
selectedOptions = ["apples", "bananas"]
```

### Step 3: Matching Raw Values

```javascript
// For each raw value, check if it contains ANY selected option
"apples, grapes".indexOf("apples") !== -1     // ✅ Match!
"oranges".indexOf("apples") !== -1            // ❌ No match
"oranges".indexOf("bananas") !== -1           // ❌ No match
"bananas, apples".indexOf("apples") !== -1    // ✅ Match!
```

### Step 4: Send Filter

```javascript
const interactionData = {
  concepts: [fieldId],
  values: [
    ["apples, grapes"],
    ["bananas, apples"],
    ["apples, bananas, strawberries"]
  ]
};

dscc.sendInteraction('crossFilter', dscc.InteractionType.FILTER, interactionData);
```

## Important Concepts Applied

### 1. **Cross-Filtering**
- Must enable "Cross-filtering" in Looker Studio chart settings
- Control sends `FILTER` interaction type
- Other charts must be configured to accept filters

### 2. **State Management**
```javascript
// Module-level variables preserve state across re-renders
let selectedOptions = [];
let lastFilterSent = null;

// Before clearing DOM, save current state
const existingCheckboxes = document.querySelectorAll('.option-checkbox:checked');
selectedOptions = Array.from(existingCheckboxes).map(cb => cb.value);

// After rebuilding DOM, restore checkboxes
if (selectedOptions.indexOf(value) !== -1) {
  checkbox.checked = true;
}
```

### 3. **Deduplication**
```javascript
const filterFingerprint = JSON.stringify({
  concept: fieldId,
  selections: selectedOptions.sort(),
  count: matchingValues.length
});

if (filterFingerprint === lastFilterSent) {
  return; // Skip duplicate filter
}
```

### 4. **Re-render Handling**
```javascript
const isRerender = selectedOptions.length > 0;

if (isRerender) {
  // Re-trigger filter to maintain state after Looker re-renders
  setTimeout(function() {
    handleSelectionChange();
  }, 0);
}
```

## Testing

### Local Testing
```bash
npm run start
```
- Opens in browser with mock data
- Good for UI testing
- **Filter interactions won't work locally**

### Production Testing
```bash
npm run push:dev
```
- Deploys to GCS dev bucket
- Add to Looker Studio report
- Enable cross-filtering
- Test with real data

### Console Debugging

Enable detailed logging:
```javascript
console.log('Found X unique values:', uniqueValues);
console.log('Selected options:', selectedOptions);
console.log('Raw values matching selection:', matchingRawValues);
console.log('>>> SENDING Filter Interaction <<<');
```

## Common Issues & Solutions

### Issue 1: Filter Not Working
**Symptoms:** Selections don't filter other charts

**Solutions:**
1. ✅ Enable "Cross-filtering" in chart settings
2. ✅ Make sure dimension is required (`min: 1`)
3. ✅ Check console for filter interactions being sent
4. ✅ Verify field ID matches between config and data

### Issue 2: Options Not Appearing
**Symptoms:** Dropdown is empty

**Solutions:**
1. ✅ Check delimiter matches your data (`,` vs `;` vs `|`)
2. ✅ Ensure field contains text data
3. ✅ Check console: "Found X unique values"
4. ✅ Verify data is being received (`data.tables.DEFAULT`)

### Issue 3: Selections Reset
**Symptoms:** Selections disappear when other filters change

**Solutions:**
1. ✅ State preservation is working correctly (see `selectedOptions`)
2. ✅ Re-render detection triggers filter re-application
3. ✅ Check for errors in console

### Issue 4: Too Many Values
**Symptoms:** List is too long, performance issues

**Solutions:**
1. Consider limiting the field or using a different approach
2. Add search/filter functionality to the dropdown
3. Use pagination or virtual scrolling

## Customization Ideas

### 1. Add Search Box
```javascript
const searchInput = document.createElement('input');
searchInput.placeholder = 'Search...';
searchInput.oninput = function() {
  // Filter visible options based on search
};
```

### 2. Show Selection Count
```javascript
const countText = document.createElement('div');
countText.innerText = selectedOptions.length + ' selected';
```

### 3. Group Options
```javascript
// Group alphabetically
const grouped = {};
uniqueValues.forEach(v => {
  const firstLetter = v[0].toUpperCase();
  if (!grouped[firstLetter]) grouped[firstLetter] = [];
  grouped[firstLetter].push(v);
});
```

### 4. Support Multiple Fields
Change config to `max: 10`, then create separate dropdown for each field.

## Performance Considerations

### Efficient for:
- ✅ Up to ~100 unique options
- ✅ Up to ~10,000 raw rows
- ✅ Short delimiter strings

### May struggle with:
- ❌ 1000+ unique options (UI becomes slow)
- ❌ Very long delimited strings (parsing overhead)
- ❌ Complex regex patterns as delimiters

## Browser Compatibility

- ✅ Chrome (recommended)
- ✅ Firefox
- ✅ Safari
- ✅ Edge

**Note:** Uses ES5 syntax for maximum compatibility with Looker Studio's webpack configuration.

## Deployment

### Development
```bash
npm run build:dev
npm run push:dev
```

### Production
```bash
npm run build:prod
npm run push:prod
```

## License

ISC

## Author

landanqrew


