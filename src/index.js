const dscc = require('@google/dscc');
const local = require('./localMessage.js');

function parseCssColorToRgb(color) {
  if (!color) return null;
  const c = String(color).trim();
  if (!c || c === 'transparent') return null;

  // #rgb, #rrggbb, #rrggbbaa
  if (c[0] === '#') {
    const hex = c.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      return { r, g, b };
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return { r, g, b };
    }
    return null;
  }

  // rgb(...) / rgba(...)
  const m = c.match(/^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)$/i);
  if (m) {
    const r = Math.max(0, Math.min(255, Number(m[1])));
    const g = Math.max(0, Math.min(255, Number(m[2])));
    const b = Math.max(0, Math.min(255, Number(m[3])));
    if ([r, g, b].some(function(v) { return !Number.isFinite(v); })) return null;
    return { r, g, b };
  }

  return null;
}

function computeHoverBgForBaseColor(baseColor) {
  const rgb = parseCssColorToRgb(baseColor);
  if (!rgb) return 'rgba(0, 0, 0, 0.06)'; // reasonable default for light UIs

  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  // Dark background → lighten on hover; light background → darken slightly on hover.
  return luminance < 0.5 ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
}

// Store selected options across re-renders
let selectedOptions = [];
// Persist the option/raw-value universe via set union so the option list never shrinks.
// This prevents the control's own filtering (or other filters) from collapsing the list,
// while still allowing it to grow when upstream constraints broaden.
let optionUniverseSet = new Set(); // Set<string>
let rawValueUniverseSet = new Set(); // Set<string>
let lastDelimiterConfig = null; // string|null
let lastDelimitedFieldId = null; // string|null
// Track the last filter we sent to avoid re-sending the same filter
let lastFilterSent = null;
// Track whether we already applied the style-configured default selection
let didApplyDefaultSelection = false;

// Main Viz Rendering
const drawViz = function(data) {
  // console.log('═══ drawViz called ═══');
  // console.log('Current state before render:', { selectedOptions: selectedOptions.slice() });
  
  // Preserve current selections before clearing
  const existingCheckboxes = document.querySelectorAll('.option-checkbox:checked');
  if (existingCheckboxes.length > 0) {
    selectedOptions = [];
    existingCheckboxes.forEach(function(checkbox) {
      selectedOptions.push(checkbox.value);
    });
    // console.log('Preserved selections from DOM:', selectedOptions);
  }
  
  // Clear existing content
  document.body.innerHTML = '';

  // console.log("data: ", data);

  const style = data.style || {};
  const delimiterField = data.fields.delimitedDimension && data.fields.delimitedDimension[0];
  const dataSetMetricField = data.fields.dataSetMetric && data.fields.dataSetMetric[0];
  // console.log("dataSetMetricField: ", dataSetMetricField);
  
  // Read delimiter from style configuration
  // console.log("fieldConfig: ", style.delimiter);
  const delimiterConfig = (style.delimiter && style.delimiter.value) || ',';
  // console.log('Delimiter config:', delimiterConfig);
  
  // Read allowMultiSelect setting
  const allowMultiSelect = style.allowMultiSelect ? (style.allowMultiSelect.value === true || style.allowMultiSelect.value === 'true') : true;
  // console.log('Allow Multi-Select:', allowMultiSelect);
  
  // Text styles
  const fontColor = style.fontColor ? (style.fontColor.value && style.fontColor.value.color || style.fontColor.value) : '#000000';
  const fontFamily = style.textFontFamily ? (style.textFontFamily.value || 'Roboto') : 'Roboto';
  const buttonTextSize = style.buttonTextFontSize ? (style.buttonTextFontSize.value || 12) : 12;
  
  // Search box styles
  const searchBoxFontColor = style.searchBoxFontColor ? (style.searchBoxFontColor.value && style.searchBoxFontColor.value.color || style.searchBoxFontColor.value) : '#000000';
  const searchBoxFontFamily = style.searchBoxFontFamily ? (style.searchBoxFontFamily.value || 'Roboto') : 'Roboto';
  const searchBoxFontSize = style.searchBoxFontSize ? (style.searchBoxFontSize.value || 12) : 12;
  const searchBoxPlaceholder = style.searchBoxPlaceholder ? (style.searchBoxPlaceholder.value || 'Type to search') : 'Type to search';
  const hideSearchBox = style.hideSearchBox ? (style.hideSearchBox.value === true || style.hideSearchBox.value === 'true') : false;
  // Checkbox styles
  const checkboxDefaultOption = style.checkboxDefaultOption ? (style.checkboxDefaultOption.value || '') : '';
  const checkboxTextSize = style.checkboxTextSize ? (style.checkboxTextSize.value || 12) : 12;
  const checkboxFontColor = style.checkboxFontColor ? (style.checkboxFontColor.value && style.checkboxFontColor.value.color || style.checkboxFontColor.value) : '#202124';
  const dividerColor = style.checkboxDividerColor ? (style.checkboxDividerColor.value && style.checkboxDividerColor.value.color || style.checkboxDividerColor.value) : '#dadce0';
  const checkboxBackgroundColor = style.checkboxBackgroundColor ? (style.checkboxBackgroundColor.value && style.checkboxBackgroundColor.value.color || style.checkboxBackgroundColor.value) : '#ffffff';
  const checkboxBackgroundOpacity = style.checkboxBackgroundOpacity ? (style.checkboxBackgroundOpacity.value || 1) : 1;
  const checkboxBorderRadius = style.checkboxBorderRadius ? (style.checkboxBorderRadius.value || 4) : 4;
  const checkboxBorderColor = style.checkboxBorderColor ? (style.checkboxBorderColor.value && style.checkboxBorderColor.value.color || style.checkboxBorderColor.value) : '#dadce0';
  const checkboxBorderWidth = style.checkboxBorderWidth ? (style.checkboxBorderWidth.value || '1') : '1';

  // Container + control box styling (explicit style config; not the host "default" background/border)
  // console.log("style: ", JSON.stringify(style, null, 2));
  // Ensure the iframe page itself is transparent where possible.
  // Note: This still may not allow "seeing through" to other Looker Studio elements when overlapping,
  // because the host iframe/container can remain opaque.
  document.documentElement.style.backgroundColor = 'transparent';
  document.body.style.backgroundColor = 'transparent';

  const containerTransparentBackground = style.containerTransparentBackground
    ? (style.containerTransparentBackground.value === true || style.containerTransparentBackground.value === 'true')
    : false;
  const containerBackgroundColor = style.containerBackgroundColor
    ? (style.containerBackgroundColor.value && style.containerBackgroundColor.value.color || style.containerBackgroundColor.value)
    : '#ffffff';
  const containerBackgroundOpacity = style.containerBackgroundOpacity ? (style.containerBackgroundOpacity.value || 1) : 1;
  const containerBorderRadius = style.containerBorderRadius ? (style.containerBorderRadius.value || 8) : 8;
  const containerBorderColor = style.containerBorderColor
    ? (style.containerBorderColor.value && style.containerBorderColor.value.color || style.containerBorderColor.value)
    : '#dadce0';
  const containerBorderWidth = style.containerBorderWidth ? (style.containerBorderWidth.value || '0') : '0';
  const containerPadding = style.containerPadding ? (style.containerPadding.value || '0') : '0';

  const controlBoxTransparentBackground = style.controlBoxTransparentBackground
    ? (style.controlBoxTransparentBackground.value === true || style.controlBoxTransparentBackground.value === 'true')
    : false;
  const controlBoxBackgroundColor = style.controlBoxBackgroundColor
    ? (style.controlBoxBackgroundColor.value && style.controlBoxBackgroundColor.value.color || style.controlBoxBackgroundColor.value)
    : '#ffffff';
  const controlBoxBackgroundOpacity = style.controlBoxBackgroundOpacity ? (style.controlBoxBackgroundOpacity.value || 1) : 1;
  const controlBoxBorderRadius = style.controlBoxBorderRadius ? (style.controlBoxBorderRadius.value || 8) : 8;
  const controlBoxBorderColor = style.controlBoxBorderColor
    ? (style.controlBoxBorderColor.value && style.controlBoxBorderColor.value.color || style.controlBoxBorderColor.value)
    : '#dadce0';
  const controlBoxBorderWidth = style.controlBoxBorderWidth ? (style.controlBoxBorderWidth.value || '1') : '1';
  const controlBoxPadding = style.controlBoxPadding ? (style.controlBoxPadding.value || '8px 12px') : '8px 12px';
  const controlBoxMinHeight = style.controlBoxMinHeight ? (style.controlBoxMinHeight.value || '48px') : '48px';

  if (!delimiterField) {
    const msg = document.createElement('div');
    msg.innerText = 'Please select a Delimited Dimension.';
    msg.style.padding = '20px';
    msg.style.textAlign = 'center';
    document.body.appendChild(msg);
    return;
  }
  
  // console.log('Delimited field:', delimiterField);
  // console.log('Delimiter:', delimiterConfig);

  // Extract unique values from delimited data
  // Reset universes if the configured delimiter or the bound field changes
  // (tokenization would no longer be compatible).
  const currentDelimitedFieldId = delimiterField && delimiterField.id ? delimiterField.id : null;
  if (
    lastDelimiterConfig !== null &&
    (delimiterConfig !== lastDelimiterConfig || currentDelimitedFieldId !== lastDelimitedFieldId)
  ) {
    optionUniverseSet = new Set();
    rawValueUniverseSet = new Set();
    didApplyDefaultSelection = false;
  }
  lastDelimiterConfig = delimiterConfig;
  lastDelimitedFieldId = currentDelimitedFieldId;

  if (data.tables && data.tables.DEFAULT) {
    data.tables.DEFAULT.forEach(function(row) {
      const cellValue = row.delimitedDimension && row.delimitedDimension[0];
      if (cellValue) {
        rawValueUniverseSet.add(cellValue);
        // Split by delimiter and trim whitespace
        const parts = String(cellValue).split(delimiterConfig);
        parts.forEach(function(part) {
          const trimmed = part.trim();
          if (trimmed) {
            optionUniverseSet.add(trimmed);
          }
        });
      }
    });
  }

  const uniqueValuesSet = optionUniverseSet;
  const rawValues = Array.from(rawValueUniverseSet);

  // Apply default selections only on initial render (don't override preserved selections).
  // Style config uses empty string as default; treat empty/whitespace as "no default".
  if (
    selectedOptions.length === 0 &&
    checkboxDefaultOption &&
    String(checkboxDefaultOption).trim().length > 0 &&
    !didApplyDefaultSelection
  ) {
    const rawDefault = String(checkboxDefaultOption).trim();
    const defaultParts = rawDefault.indexOf(delimiterConfig) !== -1
      ? rawDefault.split(delimiterConfig).map(function(p) { return p.trim(); }).filter(Boolean)
      : [rawDefault];

    if (allowMultiSelect) {
      // Keep only defaults that actually exist in the dataset options
      const presentDefaults = defaultParts.filter(function(p) { return uniqueValuesSet.has(p); });
      if (presentDefaults.length > 0) {
        selectedOptions = presentDefaults;
        console.log('Applied default selection from config:', selectedOptions);
      } else {
        console.log('Default selection not found in dataset; no pre-check applied:', defaultParts);
      }
    } else {
      // Single-select edge case: only consider the first provided item.
      const firstDefault = defaultParts[0];
      if (firstDefault && uniqueValuesSet.has(firstDefault)) {
        selectedOptions = [firstDefault];
        // console.log('Applied default selection from config (single-select):', selectedOptions);
      } else {
        console.log('Default selection not found in dataset; no pre-check applied (single-select):', defaultParts);
      }
    }

    // Mark as applied so we don't keep retrying on subsequent renders.
    didApplyDefaultSelection = true;
  }

  const countRowsWithDimension = (delimitedValue) => {
    let count = 0;
    if (data.tables && data.tables.DEFAULT) {
      data.tables.DEFAULT.forEach(function(row) {
        if (row.delimitedDimension && row.delimitedDimension[0].indexOf(delimitedValue) !== -1) {
          // Prefer summing the configured metric (e.g. Record Count) so counts reflect
          // underlying row counts even when Looker Studio sends aggregated result rows.
          // Fallback to 1 to preserve previous behavior if metric is missing/unparseable.
          const metricCell = row.dataSetMetric && row.dataSetMetric[0];
          const metricValue = Number(metricCell);
          count += Number.isFinite(metricValue) ? metricValue : 1;
        }
      });
    }
    return count;
  };
  
  const uniqueValues = Array.from(uniqueValuesSet).sort();
  // console.log('Found', uniqueValues.length, 'unique values:', uniqueValues);
  // console.log('From', rawValues.length, 'raw rows');

  if (uniqueValues.length === 0) {
    const msg = document.createElement('div');
    msg.innerText = 'No data available for filtering.';
    msg.style.padding = '20px';
    msg.style.textAlign = 'center';
    document.body.appendChild(msg);
    return;
  }

  // Create Main Container
  const container = document.createElement('div');
  container.className = 'delimited-control-container';
  
  // Apply container styles
  container.style.fontFamily = fontFamily;
  container.style.color = fontColor;
  container.style.backgroundColor = containerTransparentBackground ? 'transparent' : containerBackgroundColor;
  // Don't use container opacity, because it makes all children translucent.
  container.style.border = containerBorderWidth + 'px solid ' + containerBorderColor;
  container.style.borderRadius = containerBorderRadius + 'px';
  container.style.padding = containerPadding;

  // === SECTION 1: Field Values Dropdown ===
  const valuesSection = document.createElement('div');
  valuesSection.className = 'dropdown-section';
  // Apply control box styles to the outer section (header + dropdown)
  valuesSection.style.border = controlBoxBorderWidth + 'px solid ' + controlBoxBorderColor;
  valuesSection.style.borderRadius = controlBoxBorderRadius + 'px';
  valuesSection.style.backgroundColor = controlBoxTransparentBackground ? 'transparent' : controlBoxBackgroundColor;
  // Avoid opacity for the same reason as the container.

  // Header
  const valuesHeader = document.createElement('div');
  valuesHeader.className = 'dropdown-header';
  valuesHeader.style.backgroundColor = controlBoxTransparentBackground ? 'transparent' : controlBoxBackgroundColor;
  valuesHeader.style.padding = controlBoxPadding;
  valuesHeader.style.minHeight = controlBoxMinHeight;
  valuesHeader.style.fontSize = buttonTextSize + 'px';
  valuesHeader.style.borderRadius = controlBoxBorderRadius + 'px';

  valuesHeader.style.color = fontColor;
  
  const valuesHeaderText = document.createElement('span');
  valuesHeaderText.className = 'dropdown-header-text';
  
  // Add header checkbox (only visible when multi-select is enabled and dropdown is expanded)
  const headerCheckbox = document.createElement('input');
  headerCheckbox.type = 'checkbox';
  headerCheckbox.className = 'header-checkbox';
  headerCheckbox.title = 'Select/Deselect All';
  
  const headerLabel = document.createElement('span');
  let headerLabelText = delimiterField.name || 'Select Values';
  if (delimiterField.name && selectedOptions.length > 0 && allowMultiSelect) {
    const selectedOptionsString = selectedOptions.join(', ');
    headerLabelText = delimiterField.name + ' (' + (selectedOptionsString.length > 30 ? selectedOptionsString.slice(0, 27) +  '...' : selectedOptionsString) + ')';
  } else if (delimiterField.name && selectedOptions.length > 0 && !allowMultiSelect) {
    headerLabelText = delimiterField.name + ' (' + selectedOptions[0] + ')';
  }
  headerLabel.innerText = headerLabelText;
  headerLabel.style.fontSize = buttonTextSize + 'px';
  headerLabel.style.color = fontColor;
  
  // Only append checkbox if multi-select is enabled
  if (allowMultiSelect) {
    valuesHeaderText.appendChild(headerCheckbox);
  }
  valuesHeaderText.appendChild(headerLabel);
  
  const valuesArrow = document.createElement('div');
  // Start collapsed; only expand on header click.
  valuesArrow.className = 'dropdown-arrow';
  
  valuesHeader.appendChild(valuesHeaderText);
  valuesHeader.appendChild(valuesArrow);
  
  // Content (expanded by default)
  const valuesContent = document.createElement('div');
  // Start collapsed; only expand on header click.
  valuesContent.className = 'dropdown-content';
  // Apply background styles
  valuesContent.style.backgroundColor = controlBoxTransparentBackground ? 'transparent' : controlBoxBackgroundColor;
  
  // Selection summary
  const selectionSummary = document.createElement('div');
  selectionSummary.className = 'selection-summary';
  selectionSummary.innerText = selectedOptions.length + ' selected';
  valuesContent.appendChild(selectionSummary);
  
  let searchContainer, searchBox;
  // Search box
  if (!hideSearchBox) {
    searchContainer = document.createElement('div');
    searchContainer.className = 'search-container';
    searchContainer.style.borderBottomColor = dividerColor;
  
  
    searchBox = document.createElement('input');
    searchBox.type = 'text';
    searchBox.className = 'search-box';
    searchBox.placeholder = searchBoxPlaceholder ? searchBoxPlaceholder : 'Type to search';
    searchBox.style.fontSize = checkboxTextSize + 'px';
    searchBox.style.fontFamily = fontFamily;

    searchContainer.appendChild(searchBox);
    
    valuesContent.appendChild(searchContainer);
  }
  
  // Options container
  const optionsContainer = document.createElement('div');
  optionsContainer.className = 'options-container';
  optionsContainer.style.backgroundColor = checkboxBackgroundColor;
  optionsContainer.style.opacity = checkboxBackgroundOpacity;
  optionsContainer.style.borderRadius = checkboxBorderRadius + 'px';
  optionsContainer.style.border = checkboxBorderWidth + 'px solid ' + checkboxBorderColor;
  // Dynamic hover color for list items, based on the background of the list container.
  optionsContainer.style.setProperty('--ls-option-hover-bg', computeHoverBgForBaseColor(checkboxBackgroundColor));
  
  // Store all option elements for search filtering
  const allOptionElements = [];
  
  // Create checkbox for each unique value
  uniqueValues.forEach(function(value) {
    const optionDiv = document.createElement('div');
    optionDiv.className = 'option-item';
    optionDiv.setAttribute('data-value', value.toLowerCase());
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'option-checkbox';
    checkbox.id = 'opt-' + value.replace(/[^a-zA-Z0-9]/g, '_');
    checkbox.value = value;
    
    // Restore previous selection
    // In single-select mode, only restore the first selected option
    if (allowMultiSelect) {
      if (selectedOptions.indexOf(value) !== -1) {
        checkbox.checked = true;
      }
    } else {
      // Single-select: only check if this is the first selected option
      if (selectedOptions.length > 0 && selectedOptions[0] === value) {
        checkbox.checked = true;
      }
    }
    
    const label = document.createElement('label');
    label.htmlFor = checkbox.id;
    
    const labelText = document.createElement('span');
    labelText.innerText = value;
    labelText.style.fontSize = checkboxTextSize + 'px';
    labelText.style.color = checkboxFontColor;
    labelText.style.fontFamily = fontFamily;
    
    // Count how many raw values contain this option
    /*let count = 0;
    rawValues.forEach(function(raw) {
      if (String(raw).indexOf(value) !== -1) count++;
    });*/
    const count = countRowsWithDimension(value);
    
    const countSpan = document.createElement('span');
    countSpan.className = 'option-count';
    countSpan.innerText = (style && style.hideRecordCount && style.hideRecordCount.value) ? '' : count;
    countSpan.style.fontSize = (checkboxTextSize - 1) + 'px';
    countSpan.style.color = checkboxFontColor;
    
    label.appendChild(labelText);
    label.appendChild(countSpan);
    
    optionDiv.appendChild(checkbox);
    optionDiv.appendChild(label);
    optionsContainer.appendChild(optionDiv);
    
    allOptionElements.push(optionDiv);
    
    // Add change listener
    checkbox.addEventListener('change', function() {
      // If single-select mode, uncheck all other checkboxes
      if (!allowMultiSelect && checkbox.checked) {
        allOptionElements.forEach(function(elem) {
          const otherCb = elem.querySelector('.option-checkbox');
          if (otherCb !== checkbox && otherCb.checked) {
            otherCb.checked = false;
          }
        });
      }
      
      handleSelectionChange();
      if (allowMultiSelect) {
        updateHeaderCheckbox();
      }
    });
  });
  
  valuesContent.appendChild(optionsContainer);
  
  // Header checkbox functionality - select/deselect all visible items (only if multi-select enabled)
  if (allowMultiSelect) {
    headerCheckbox.addEventListener('click', function(e) {
      e.stopPropagation(); // Prevent triggering header click
    });
    
    headerCheckbox.addEventListener('change', function() {
      const isChecked = headerCheckbox.checked;
      allOptionElements.forEach(function(elem) {
        if (elem.style.display !== 'none') {
          const cb = elem.querySelector('.option-checkbox');
          cb.checked = isChecked;
        }
      });
      handleSelectionChange();
      
      // Close the dropdown after selecting/deselecting all
      valuesContent.classList.remove('expanded');
      valuesArrow.classList.remove('expanded');
      headerCheckbox.classList.remove('visible');
    });
  }
  
  // Apply border styles to dropdown content (already set above with background)
  valuesContent.style.borderColor = controlBoxBorderColor;
  valuesContent.style.borderWidth = controlBoxBorderWidth + 'px';
  valuesContent.style.backgroundColor = controlBoxTransparentBackground ? 'transparent' : controlBoxBackgroundColor;
  
  // Update header checkbox state when individual checkboxes change (only if multi-select enabled)
  function updateHeaderCheckbox() {
    if (!allowMultiSelect) return;
    
    const visibleCheckboxes = [];
    allOptionElements.forEach(function(elem) {
      if (elem.style.display !== 'none') {
        visibleCheckboxes.push(elem.querySelector('.option-checkbox'));
      }
    });
    
    const checkedCount = visibleCheckboxes.filter(function(cb) { return cb.checked; }).length;
    
    if (checkedCount === 0) {
      headerCheckbox.checked = false;
      headerCheckbox.indeterminate = false;
    } else if (checkedCount === visibleCheckboxes.length) {
      headerCheckbox.checked = true;
      headerCheckbox.indeterminate = false;
    } else {
      headerCheckbox.checked = false;
      headerCheckbox.indeterminate = true;
    }
  }
  
  valuesSection.appendChild(valuesHeader);
  valuesSection.appendChild(valuesContent);
  container.appendChild(valuesSection);
  
  // Toggle dropdown
  valuesHeader.onclick = function(e) {
    // Don't toggle if clicking the checkbox
    if (allowMultiSelect && e.target === headerCheckbox) return;
    
    const isExpanded = valuesContent.classList.contains('expanded');
    if (isExpanded) {
      valuesContent.classList.remove('expanded');
      valuesArrow.classList.remove('expanded');
      if (allowMultiSelect) {
        headerCheckbox.classList.remove('visible');
      }
    } else {
      valuesContent.classList.add('expanded');
      valuesArrow.classList.add('expanded');
      if (allowMultiSelect) {
        headerCheckbox.classList.add('visible');
      }
    }
  };
  
  // Initialize header checkbox state (only if multi-select enabled)
  if (allowMultiSelect) {
    updateHeaderCheckbox();
  }
  
  // Search functionality
  if (!hideSearchBox) {
    searchBox.oninput = function() {
    const searchTerm = searchBox.value.toLowerCase();
    allOptionElements.forEach(function(elem) {
      const value = elem.getAttribute('data-value');
      if (value.indexOf(searchTerm) !== -1) {
        elem.style.display = '';
      } else {
        elem.style.display = 'none';
      }
    });
    } 
  };
  /*
  // === SECTION 2: Delimiter Selector ===
  const delimiterSection = document.createElement('div');
  delimiterSection.className = 'dropdown-section';
  
  const delimiterHeader = document.createElement('div');
  delimiterHeader.className = 'dropdown-header';
  
  const delimiterHeaderText = document.createElement('span');
  delimiterHeaderText.className = 'dropdown-header-text';
  delimiterHeaderText.innerText = 'Delimiter';
  
  const delimiterArrow = document.createElement('div');
  delimiterArrow.className = 'dropdown-arrow';
  
  delimiterHeader.appendChild(delimiterHeaderText);
  delimiterHeader.appendChild(delimiterArrow);
  
  const delimiterContent = document.createElement('div');
  delimiterContent.className = 'dropdown-content';
  
  const delimiterOptions = document.createElement('div');
  delimiterOptions.className = 'delimiter-options';
  
  const delimiters = [
    { value: ',', label: 'Comma (,)' },
    { value: '-', label: 'Hyphen (-)' },
    { value: '|', label: 'Pipe (|)' },
    { value: '\t', label: 'Tab' },
    { value: '\n', label: 'Newline' }
  ];
  
  delimiters.forEach(function(delim) {
    const optionDiv = document.createElement('div');
    optionDiv.className = 'delimiter-option';
    
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'delimiter';
    radio.className = 'delimiter-radio';
    radio.value = delim.value;
    radio.id = 'delim-' + delim.label.replace(/[^a-zA-Z0-9]/g, '_');
    
    if (delim.value === currentDelimiter) {
      radio.checked = true;
    }
    
    const label = document.createElement('label');
    label.htmlFor = radio.id;
    label.innerText = delim.label;
    
    optionDiv.appendChild(radio);
    optionDiv.appendChild(label);
    delimiterOptions.appendChild(optionDiv);
    
    radio.addEventListener('change', function() {
      if (radio.checked) {
        currentDelimiter = delim.value;
        console.log('Delimiter changed to:', currentDelimiter);
        selectedOptions = [];
        lastFilterSent = null;
        drawViz(data);
      }
    });
  });
  
  delimiterContent.appendChild(delimiterOptions);
  delimiterSection.appendChild(delimiterHeader);
  delimiterSection.appendChild(delimiterContent);
  container.appendChild(delimiterSection);
  
  // Toggle delimiter dropdown
  delimiterHeader.onclick = function() {
    const isExpanded = delimiterContent.classList.contains('expanded');
    if (isExpanded) {
      delimiterContent.classList.remove('expanded');
      delimiterArrow.classList.remove('expanded');
    } else {
      delimiterContent.classList.add('expanded');
      delimiterArrow.classList.add('expanded');
    }
  };
  */
  document.body.appendChild(container);

  // Calculate and set dynamic dropdown sizing based on visualization dimensions
  function updateDropdownSizing() {
    const viewportHeight = window.innerHeight;
    const headerHeight = valuesHeader.offsetHeight || 48;
    const searchBoxHeight = hideSearchBox ? 0 : (searchContainer ? searchContainer.offsetHeight : 60);
    const selectionSummaryHeight = 0; // Hidden by default
    const padding = 20; // Buffer space for borders, shadows, etc.
    
    // Calculate available height for dropdown content (below the header)
    const dropdownMaxHeight = Math.max(100, viewportHeight - headerHeight - padding);
    
    // Calculate available height for options list (inside dropdown, minus search box)
    const optionsMaxHeight = Math.max(60, dropdownMaxHeight - searchBoxHeight - selectionSummaryHeight - padding);
    
    // Set CSS variables on the document root
    document.documentElement.style.setProperty('--dropdown-max-height', dropdownMaxHeight + 'px');
    document.documentElement.style.setProperty('--options-max-height', optionsMaxHeight + 'px');
  }
  
  // Initial sizing calculation
  updateDropdownSizing();
  
  // Update sizing on window resize
  window.addEventListener('resize', updateDropdownSizing);

  // Track if this is a re-render (i.e., we have a selection to re-apply after DOM rebuild)
  const isRerender = selectedOptions.length > 0;
  console.log('Is this a re-render?', isRerender, 'with', selectedOptions.length, 'selections');

  // Interaction Logic
  function handleSelectionChange() {
    console.log('─── handleSelectionChange triggered ───');
    
    // Get currently selected values
    const checkboxes = document.querySelectorAll('.option-checkbox:checked');
    selectedOptions = [];
    checkboxes.forEach(function(cb) {
      selectedOptions.push(cb.value);
    });
    
    console.log('Selected options:', selectedOptions);
    
    // Update the header label to reflect current selections
    let updatedHeaderText = delimiterField.name || 'Select Values';
    if (delimiterField.name && selectedOptions.length > 0 && allowMultiSelect) {
      const selectedOptionsString = selectedOptions.join(', ');
      updatedHeaderText = delimiterField.name + ' (' + (selectedOptionsString.length > 30 ? selectedOptionsString.slice(0, 27) + '...' : selectedOptionsString) + ')';
    } else if (delimiterField.name && selectedOptions.length > 0 && !allowMultiSelect) {
      updatedHeaderText = delimiterField.name + ' (' + selectedOptions[0] + ')';
    }
    headerLabel.innerText = updatedHeaderText;
    
    // Update the selection summary count
    selectionSummary.innerText = selectedOptions.length + ' selected';
    
    if (selectedOptions.length === 0) {
      // Clear filter if nothing selected
      if (lastFilterSent !== null) {
        console.log('Clearing filter (no selections)');
        const FILTER = dscc.InteractionType.FILTER;
        dscc.clearInteraction('crossFilter', FILTER);
        lastFilterSent = null;
      }
      return;
    }

    // Find all raw values that contain at least one selected option
    const matchingRawValues = [];
    rawValues.forEach(function(rawValue) {
      const rawStr = String(rawValue);
      // Check if ANY selected option is found in this raw value
      for (var i = 0; i < selectedOptions.length; i++) {
        if (rawStr.indexOf(selectedOptions[i]) !== -1) {
          if (matchingRawValues.indexOf(rawValue) === -1) {
            matchingRawValues.push(rawValue);
          }
          break; // Found a match, no need to check other options
        }
      }
    });

    console.log('Raw values matching selection:', matchingRawValues.length, 'of', rawValues.length);
    console.log('Sample matches:', matchingRawValues.slice(0, 5));

    if (matchingRawValues.length === 0) {
      console.warn('No raw values match the selections');
      const FILTER = dscc.InteractionType.FILTER;
      dscc.clearInteraction('crossFilter', FILTER);
      lastFilterSent = null;
      return;
    }

    // Create filter fingerprint
    const filterFingerprint = JSON.stringify({
      concept: delimiterField.id,
      selections: selectedOptions.slice().sort(),
      count: matchingRawValues.length
    });
    
    // console.log('Filter fingerprint:', filterFingerprint);
    // console.log('Last filter sent:', lastFilterSent);

    // Deduplication check
    if (filterFingerprint === lastFilterSent) {
      // console.log('⚠️ Same filter as last time - skipping to avoid loop');
      return;
    }

    // Send filter interaction
    const FILTER = dscc.InteractionType.FILTER;
    const interactionId = 'crossFilter';
    const interactionData = {
      concepts: [delimiterField.id],
      values: matchingRawValues.map(function(v) { return [v]; })
    };

    // console.log('>>> SENDING Filter Interaction <<<');
    // console.log('Concepts:', interactionData.concepts);
    // console.log('Number of values:', interactionData.values.length);
    // console.log('Selected options:', selectedOptions);
    
    dscc.sendInteraction(interactionId, FILTER, interactionData);
    lastFilterSent = filterFingerprint;
    // console.log('✓ Filter interaction sent successfully');
  }

  // If this is a re-render with preserved selections, re-trigger the filter
  if (isRerender) {
    // console.log('Re-render detected - re-triggering filter to maintain state');
    setTimeout(function() {
      handleSelectionChange();
    }, 0);
  } else {
    // console.log('Initial render - waiting for user interaction.');
  }
};

// Renders locally
if (typeof DSCC_IS_LOCAL !== 'undefined' && DSCC_IS_LOCAL) {
  drawViz(local.message);
} else {
  dscc.subscribeToData(drawViz, {transform: dscc.objectTransform});
}
