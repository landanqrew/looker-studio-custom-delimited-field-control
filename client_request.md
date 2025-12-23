- Styling options like the built-in dropdown would be fantastic (text/header/checkbox styling).
- Can selected option(s) show up in the main control box? For example:  
  _Assignees: Bob_
- Is there a way for the dropdown list to auto-collapse instead of staying open until you click on it? -> I could not find a way to get access to a click event outside of the visualization
- Don’t think we need date range dimension or default date range filter options. -> don't think this can be removed
- Possible to have an option between enforced single select vs. multi-select? If this adds a bunch of complexity, my current use case is single select, so maybe we just build for that right now and if I need multi-select in the future, we can build another version that handles it.
- For enforced single select, probably need a default selection box (or the ability for it to select the first from the list by default would work too).
- If we are going to keep multi-select, then selecting one person should not filter the list eliminating other options.