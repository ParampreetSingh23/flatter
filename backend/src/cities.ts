// ponytail: placeholder launch list (docs/onbaordig.md leaves cities to product). Edit here; clients read it from GET /api/onboarding.
export const CITIES: Record<string, string[]> = {
  Bengaluru: ["Koramangala", "HSR Layout", "Indiranagar", "Whitefield", "Electronic City", "Marathahalli", "Bellandur", "JP Nagar"],
  Mumbai: ["Andheri", "Powai", "Bandra", "Thane", "Navi Mumbai", "Goregaon", "Malad", "Borivali"],
  "Delhi NCR": ["Gurugram", "Noida", "Dwarka", "Saket", "Lajpat Nagar", "Laxmi Nagar", "Greater Noida", "Faridabad"],
  Pune: ["Kothrud", "Hinjewadi", "Viman Nagar", "Baner", "Wakad", "Hadapsar", "Kharadi", "Aundh"],
  Hyderabad: ["Gachibowli", "HITEC City", "Madhapur", "Kondapur", "Banjara Hills", "Kukatpally", "Begumpet", "Secunderabad"],
};
export const CITY_NAMES = Object.keys(CITIES) as [string, ...string[]];
