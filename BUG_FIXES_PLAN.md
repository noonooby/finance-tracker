# 🐛 BUG FIXES - Summary and Implementation Plan

## **Bugs to Fix:**

### **1. Settings - Category Section Missing Icon**
**Issue:** Categories section header uses text instead of icon like other sections  
**Fix:** Add icon to match other sections (use Palette or Grid icon)

### **2. Settings - Sections Always Expanded by Default**
**Issue:** Some sections default to expanded (categories: true), inconsistent  
**Fix:** Change ALL sections to default collapsed (false)

### **3. Settings - No Persistent Memory for Expanded Sections**
**Issue:** Expanded state resets on page refresh  
**Fix:** 
- Add `collapsed_settings_sections` to userPreferencesManager
- Save/load expanded state
- Persist across sessions and devices

### **4. Reports - Payments Not Showing**
**Issue:** Credit card payments from bank account don't appear in reports  
**Fix:** Need to investigate report filtering logic

### **5. Reports - "Categories Used" Shows Currency**
**Issue:** Should show count (e.g., "5 categories") not "$5.00"  
**Fix:** Remove formatCurrency for count fields

### **6. Dashboard - Compact Mode Not Compact Enough**
**Issue:** Compact mode should be much tighter/neater  
**Fix:** Reduce all padding, margins, font sizes in compact mode

---

## **Implementation Order:**

1. Settings icon + default collapsed + persistent memory (30 min)
2. Reports payment filtering (15 min)
3. Reports currency format fix (5 min)
4. Dashboard compact mode enhancement (15 min)

Total: ~65 minutes

---

**Starting with Settings fixes first...**
