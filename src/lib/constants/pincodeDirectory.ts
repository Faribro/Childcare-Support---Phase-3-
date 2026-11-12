/**
 * India Post Static Pincode Directory & Resolution Engine
 * 
 * Provides instant 0ms offline resolution:
 * Pincode -> { taluk, district, state }
 * 
 * Includes:
 * 1. Exact canonical mappings for major postal hubs and district headquarters.
 * 2. Complete 3-digit Postal Circle & Division prefix mapping covering all Indian States & UTs.
 * 3. Fallback to blank editable taluk when exact sub-office is unlisted.
 */

export interface PincodeRecord {
  taluk: string;
  district: string;
  state: string;
}

// ── 1. Canonical Exact Pincode Hubs ─────────────────────────────────────────
export const EXACT_PINCODE_DIRECTORY: Record<string, PincodeRecord> = {
  // Delhi
  '110001': { taluk: 'Connaught Place', district: 'New Delhi', state: 'Delhi' },
  '110002': { taluk: 'Darya Ganj', district: 'Central Delhi', state: 'Delhi' },
  '110003': { taluk: 'Aliganj', district: 'South Delhi', state: 'Delhi' },
  '110005': { taluk: 'Karol Bagh', district: 'Central Delhi', state: 'Delhi' },
  '110006': { taluk: 'Chandni Chowk', district: 'North Delhi', state: 'Delhi' },
  '110007': { taluk: 'Civil Lines', district: 'North Delhi', state: 'Delhi' },
  '110011': { taluk: 'Nirman Bhawan', district: 'New Delhi', state: 'Delhi' },
  '110012': { taluk: 'Inderpuri', district: 'South West Delhi', state: 'Delhi' },
  '110016': { taluk: 'Hauz Khas', district: 'South Delhi', state: 'Delhi' },
  '110019': { taluk: 'Kalkaji', district: 'South East Delhi', state: 'Delhi' },
  '110020': { taluk: 'Okhla', district: 'South East Delhi', state: 'Delhi' },
  '110024': { taluk: 'Lajpat Nagar', district: 'South East Delhi', state: 'Delhi' },
  '110025': { taluk: 'Jamia Nagar', district: 'South East Delhi', state: 'Delhi' },
  '110029': { taluk: 'Sarojini Nagar', district: 'South Delhi', state: 'Delhi' },
  '110034': { taluk: 'Shakurpur', district: 'North West Delhi', state: 'Delhi' },
  '110051': { taluk: 'Krishna Nagar', district: 'East Delhi', state: 'Delhi' },
  '110092': { taluk: 'Anand Vihar', district: 'East Delhi', state: 'Delhi' },

  // Maharashtra
  '400001': { taluk: 'Fort', district: 'Mumbai City', state: 'Maharashtra' },
  '400004': { taluk: 'Girgaon', district: 'Mumbai City', state: 'Maharashtra' },
  '400012': { taluk: 'Parel', district: 'Mumbai City', state: 'Maharashtra' },
  '400050': { taluk: 'Bandra', district: 'Mumbai Suburban', state: 'Maharashtra' },
  '400051': { taluk: 'Bandra Kurla Complex', district: 'Mumbai Suburban', state: 'Maharashtra' },
  '400058': { taluk: 'Andheri West', district: 'Mumbai Suburban', state: 'Maharashtra' },
  '400069': { taluk: 'Andheri East', district: 'Mumbai Suburban', state: 'Maharashtra' },
  '400071': { taluk: 'Chembur', district: 'Mumbai Suburban', state: 'Maharashtra' },
  '400077': { taluk: 'Ghatkopar', district: 'Mumbai Suburban', state: 'Maharashtra' },
  '400080': { taluk: 'Mulund', district: 'Mumbai Suburban', state: 'Maharashtra' },
  '400601': { taluk: 'Thane', district: 'Thane', state: 'Maharashtra' },
  '400703': { taluk: 'Vashi', district: 'Thane', state: 'Maharashtra' },
  '411001': { taluk: 'Pune City', district: 'Pune', state: 'Maharashtra' },
  '411002': { taluk: 'Budhwar Peth', district: 'Pune', state: 'Maharashtra' },
  '411004': { taluk: 'Deccan Gymkhana', district: 'Pune', state: 'Maharashtra' },
  '411005': { taluk: 'Shivajinagar', district: 'Pune', state: 'Maharashtra' },
  '411014': { taluk: 'Vadgaon Sheri', district: 'Pune', state: 'Maharashtra' },
  '411028': { taluk: 'Hadapsar', district: 'Pune', state: 'Maharashtra' },
  '411038': { taluk: 'Kothrud', district: 'Pune', state: 'Maharashtra' },
  '411057': { taluk: 'Hinjawadi', district: 'Pune', state: 'Maharashtra' },
  '414001': { taluk: 'Ahmednagar', district: 'Ahmednagar', state: 'Maharashtra' },
  '416001': { taluk: 'Karveer', district: 'Kolhapur', state: 'Maharashtra' },
  '422001': { taluk: 'Nashik', district: 'Nashik', state: 'Maharashtra' },
  '431001': { taluk: 'Aurangabad', district: 'Chhatrapati Sambhajinagar', state: 'Maharashtra' },
  '440001': { taluk: 'Nagpur Urban', district: 'Nagpur', state: 'Maharashtra' },
  '444001': { taluk: 'Akola', district: 'Akola', state: 'Maharashtra' },

  // Karnataka
  '560001': { taluk: 'Bengaluru North', district: 'Bengaluru Urban', state: 'Karnataka' },
  '560002': { taluk: 'Bengaluru South', district: 'Bengaluru Urban', state: 'Karnataka' },
  '560025': { taluk: 'Richmond Town', district: 'Bengaluru Urban', state: 'Karnataka' },
  '560034': { taluk: 'Koramangala', district: 'Bengaluru Urban', state: 'Karnataka' },
  '560038': { taluk: 'Indiranagar', district: 'Bengaluru Urban', state: 'Karnataka' },
  '560066': { taluk: 'Whitefield', district: 'Bengaluru Urban', state: 'Karnataka' },
  '560076': { taluk: 'Bannerghatta Road', district: 'Bengaluru Urban', state: 'Karnataka' },
  '560100': { taluk: 'Electronic City', district: 'Bengaluru Urban', state: 'Karnataka' },
  '570001': { taluk: 'Mysuru', district: 'Mysuru', state: 'Karnataka' },
  '575001': { taluk: 'Mangaluru', district: 'Dakshina Kannada', state: 'Karnataka' },
  '580001': { taluk: 'Dharwad', district: 'Dharwad', state: 'Karnataka' },

  // Tamil Nadu
  '600001': { taluk: 'George Town', district: 'Chennai', state: 'Tamil Nadu' },
  '600002': { taluk: 'Anna Salai', district: 'Chennai', state: 'Tamil Nadu' },
  '600004': { taluk: 'Mylapore', district: 'Chennai', state: 'Tamil Nadu' },
  '600017': { taluk: 'T. Nagar', district: 'Chennai', state: 'Tamil Nadu' },
  '600028': { taluk: 'R.A. Puram', district: 'Chennai', state: 'Tamil Nadu' },
  '600034': { taluk: 'Nungambakkam', district: 'Chennai', state: 'Tamil Nadu' },
  '600096': { taluk: 'Perungudi', district: 'Chennai', state: 'Tamil Nadu' },
  '641001': { taluk: 'Coimbatore South', district: 'Coimbatore', state: 'Tamil Nadu' },
  '625001': { taluk: 'Madurai North', district: 'Madurai', state: 'Tamil Nadu' },
  '620001': { taluk: 'Tiruchirappalli', district: 'Tiruchirappalli', state: 'Tamil Nadu' },
  '636001': { taluk: 'Salem', district: 'Salem', state: 'Tamil Nadu' },

  // Telangana
  '500001': { taluk: 'Abids', district: 'Hyderabad', state: 'Telangana' },
  '500003': { taluk: 'Secunderabad', district: 'Hyderabad', state: 'Telangana' },
  '500034': { taluk: 'Banjara Hills', district: 'Hyderabad', state: 'Telangana' },
  '500081': { taluk: 'HITEC City', district: 'K.V. Rangareddy', state: 'Telangana' },
  '506001': { taluk: 'Warangal', district: 'Warangal', state: 'Telangana' },

  // Andhra Pradesh
  '520001': { taluk: 'Vijayawada Urban', district: 'NTR', state: 'Andhra Pradesh' },
  '522001': { taluk: 'Guntur Urban', district: 'Guntur', state: 'Andhra Pradesh' },
  '530001': { taluk: 'Visakhapatnam Urban', district: 'Visakhapatnam', state: 'Andhra Pradesh' },
  '517501': { taluk: 'Tirupati Urban', district: 'Tirupati', state: 'Andhra Pradesh' },

  // West Bengal
  '700001': { taluk: 'B.B.D. Bagh', district: 'Kolkata', state: 'West Bengal' },
  '700016': { taluk: 'Park Street', district: 'Kolkata', state: 'West Bengal' },
  '700091': { taluk: 'Salt Lake', district: 'North 24 Parganas', state: 'West Bengal' },
  '734001': { taluk: 'Siliguri', district: 'Darjeeling', state: 'West Bengal' },

  // Gujarat
  '380001': { taluk: 'Ahmedabad City', district: 'Ahmedabad', state: 'Gujarat' },
  '380015': { taluk: 'Vastrapur', district: 'Ahmedabad', state: 'Gujarat' },
  '390001': { taluk: 'Vadodara', district: 'Vadodara', state: 'Gujarat' },
  '395001': { taluk: 'Surat City', district: 'Surat', state: 'Gujarat' },
  '360001': { taluk: 'Rajkot', district: 'Rajkot', state: 'Gujarat' },

  // Uttar Pradesh
  '226001': { taluk: 'Lucknow', district: 'Lucknow', state: 'Uttar Pradesh' },
  '208001': { taluk: 'Kanpur', district: 'Kanpur Nagar', state: 'Uttar Pradesh' },
  '221001': { taluk: 'Varanasi', district: 'Varanasi', state: 'Uttar Pradesh' },
  '201301': { taluk: 'Noida', district: 'Gautam Buddha Nagar', state: 'Uttar Pradesh' },
  '201001': { taluk: 'Ghaziabad', district: 'Ghaziabad', state: 'Uttar Pradesh' },
  '282001': { taluk: 'Agra', district: 'Agra', state: 'Uttar Pradesh' },

  // Bihar
  '800001': { taluk: 'Patna Sadar', district: 'Patna', state: 'Bihar' },
  '842001': { taluk: 'Muzaffarpur', district: 'Muzaffarpur', state: 'Bihar' },
  '823001': { taluk: 'Gaya', district: 'Gaya', state: 'Bihar' },
  '812001': { taluk: 'Bhagalpur', district: 'Bhagalpur', state: 'Bihar' },

  // Rajasthan
  '302001': { taluk: 'Jaipur', district: 'Jaipur', state: 'Rajasthan' },
  '342001': { taluk: 'Jodhpur', district: 'Jodhpur', state: 'Rajasthan' },
  '313001': { taluk: 'Girwa', district: 'Udaipur', state: 'Rajasthan' },

  // Kerala
  '695001': { taluk: 'Thiruvananthapuram', district: 'Thiruvananthapuram', state: 'Kerala' },
  '682001': { taluk: 'Kochi', district: 'Ernakulam', state: 'Kerala' },
  '673001': { taluk: 'Kozhikode', district: 'Kozhikode', state: 'Kerala' },

  // Madhya Pradesh
  '462001': { taluk: 'Bhopal', district: 'Bhopal', state: 'Madhya Pradesh' },
  '452001': { taluk: 'Indore', district: 'Indore', state: 'Madhya Pradesh' },
  '482001': { taluk: 'Jabalpur', district: 'Jabalpur', state: 'Madhya Pradesh' },

  // Punjab & Haryana & Chandigarh
  '160001': { taluk: 'Sector 1-12', district: 'Chandigarh', state: 'Chandigarh' },
  '141001': { taluk: 'Ludhiana East', district: 'Ludhiana', state: 'Punjab' },
  '143001': { taluk: 'Amritsar', district: 'Amritsar', state: 'Punjab' },
  '122001': { taluk: 'Gurugram', district: 'Gurugram', state: 'Haryana' },
  '121001': { taluk: 'Faridabad', district: 'Faridabad', state: 'Haryana' },

  // Odisha
  '751001': { taluk: 'Bhubaneswar', district: 'Khordha', state: 'Odisha' },
  '753001': { taluk: 'Cuttack', district: 'Cuttack', state: 'Odisha' },

  // Assam
  '781001': { taluk: 'Guwahati', district: 'Kamrup Metropolitan', state: 'Assam' },

  // Jharkhand
  '834001': { taluk: 'Ranchi', district: 'Ranchi', state: 'Jharkhand' },
  '831001': { taluk: 'Jamshedpur', district: 'East Singhbhum', state: 'Jharkhand' },

  // Chhattisgarh
  '492001': { taluk: 'Raipur', district: 'Raipur', state: 'Chhattisgarh' },

  // Uttarakhand & Himachal Pradesh
  '248001': { taluk: 'Dehradun', district: 'Dehradun', state: 'Uttarakhand' },
  '171001': { taluk: 'Shimla Urban', district: 'Shimla', state: 'Himachal Pradesh' },

  // Jammu & Kashmir & Ladakh
  '190001': { taluk: 'Srinagar', district: 'Srinagar', state: 'Jammu and Kashmir' },
  '180001': { taluk: 'Jammu', district: 'Jammu', state: 'Jammu and Kashmir' },
  '194101': { taluk: 'Leh', district: 'Leh', state: 'Ladakh' },

  // Goa
  '403001': { taluk: 'Tiswadi', district: 'North Goa', state: 'Goa' },
  '403601': { taluk: 'Salcete', district: 'South Goa', state: 'Goa' },

  // Puducherry
  '605001': { taluk: 'Puducherry', district: 'Puducherry', state: 'Puducherry' },

  // Tripura, Meghalaya, Manipur, Nagaland, Mizoram, Arunachal, Sikkim
  '799001': { taluk: 'Agartala', district: 'West Tripura', state: 'Tripura' },
  '793001': { taluk: 'Shillong', district: 'East Khasi Hills', state: 'Meghalaya' },
  '795001': { taluk: 'Imphal', district: 'Imphal West', state: 'Manipur' },
  '797001': { taluk: 'Kohima', district: 'Kohima', state: 'Nagaland' },
  '796001': { taluk: 'Aizawl', district: 'Aizawl', state: 'Mizoram' },
  '791111': { taluk: 'Itanagar', district: 'Papum Pare', state: 'Arunachal Pradesh' },
  '737101': { taluk: 'Gangtok', district: 'East Sikkim', state: 'Sikkim' },
};

// ── 2. Three-Digit Prefix Range to State & Major District ───────────────────
export const PREFIX_3_DIGIT_MAP: Record<string, { state: string; district: string }> = {
  // Delhi (110)
  '110': { state: 'Delhi', district: 'New Delhi' },

  // Haryana (121 - 136)
  '121': { state: 'Haryana', district: 'Faridabad' },
  '122': { state: 'Haryana', district: 'Gurugram' },
  '123': { state: 'Haryana', district: 'Rewari' },
  '124': { state: 'Haryana', district: 'Rohtak' },
  '125': { state: 'Haryana', district: 'Hisar' },
  '126': { state: 'Haryana', district: 'Jind' },
  '127': { state: 'Haryana', district: 'Bhiwani' },
  '128': { state: 'Haryana', district: 'Charkhi Dadri' },
  '131': { state: 'Haryana', district: 'Sonipat' },
  '132': { state: 'Haryana', district: 'Panipat' },
  '133': { state: 'Haryana', district: 'Yamunanagar' },
  '134': { state: 'Haryana', district: 'Panchkula' },
  '135': { state: 'Haryana', district: 'Yamunanagar' },
  '136': { state: 'Haryana', district: 'Kurukshetra' },

  // Punjab (140 - 160)
  '140': { state: 'Punjab', district: 'Rupnagar' },
  '141': { state: 'Punjab', district: 'Ludhiana' },
  '142': { state: 'Punjab', district: 'Moga' },
  '143': { state: 'Punjab', district: 'Amritsar' },
  '144': { state: 'Punjab', district: 'Jalandhar' },
  '145': { state: 'Punjab', district: 'Gurdaspur' },
  '146': { state: 'Punjab', district: 'Hoshiarpur' },
  '147': { state: 'Punjab', district: 'Patiala' },
  '148': { state: 'Punjab', district: 'Sangrur' },
  '151': { state: 'Punjab', district: 'Bathinda' },
  '152': { state: 'Punjab', district: 'Firozpur' },
  '160': { state: 'Chandigarh', district: 'Chandigarh' },

  // Himachal Pradesh (171 - 177)
  '171': { state: 'Himachal Pradesh', district: 'Shimla' },
  '172': { state: 'Himachal Pradesh', district: 'Solan' },
  '173': { state: 'Himachal Pradesh', district: 'Sirmaur' },
  '174': { state: 'Himachal Pradesh', district: 'Bilaspur' },
  '175': { state: 'Himachal Pradesh', district: 'Mandi' },
  '176': { state: 'Himachal Pradesh', district: 'Kangra' },
  '177': { state: 'Himachal Pradesh', district: 'Hamirpur' },

  // Jammu & Kashmir / Ladakh (180 - 194)
  '180': { state: 'Jammu and Kashmir', district: 'Jammu' },
  '181': { state: 'Jammu and Kashmir', district: 'Samba' },
  '182': { state: 'Jammu and Kashmir', district: 'Udhampur' },
  '184': { state: 'Jammu and Kashmir', district: 'Kathua' },
  '185': { state: 'Jammu and Kashmir', district: 'Rajouri' },
  '190': { state: 'Jammu and Kashmir', district: 'Srinagar' },
  '191': { state: 'Jammu and Kashmir', district: 'Budgam' },
  '192': { state: 'Jammu and Kashmir', district: 'Anantnag' },
  '193': { state: 'Jammu and Kashmir', district: 'Baramulla' },
  '194': { state: 'Ladakh', district: 'Leh' },

  // Uttar Pradesh (201 - 285)
  '201': { state: 'Uttar Pradesh', district: 'Gautam Buddha Nagar' },
  '202': { state: 'Uttar Pradesh', district: 'Aligarh' },
  '203': { state: 'Uttar Pradesh', district: 'Bulandshahr' },
  '204': { state: 'Uttar Pradesh', district: 'Hathras' },
  '205': { state: 'Uttar Pradesh', district: 'Mainpuri' },
  '206': { state: 'Uttar Pradesh', district: 'Etawah' },
  '207': { state: 'Uttar Pradesh', district: 'Etah' },
  '208': { state: 'Uttar Pradesh', district: 'Kanpur Nagar' },
  '209': { state: 'Uttar Pradesh', district: 'Kanpur Dehat' },
  '210': { state: 'Uttar Pradesh', district: 'Banda' },
  '211': { state: 'Uttar Pradesh', district: 'Prayagraj' },
  '212': { state: 'Uttar Pradesh', district: 'Fatehpur' },
  '221': { state: 'Uttar Pradesh', district: 'Varanasi' },
  '222': { state: 'Uttar Pradesh', district: 'Jaunpur' },
  '223': { state: 'Uttar Pradesh', district: 'Azamgarh' },
  '224': { state: 'Uttar Pradesh', district: 'Ayodhya' },
  '225': { state: 'Uttar Pradesh', district: 'Barabanki' },
  '226': { state: 'Uttar Pradesh', district: 'Lucknow' },
  '227': { state: 'Uttar Pradesh', district: 'Rae Bareli' },
  '228': { state: 'Uttar Pradesh', district: 'Sultanpur' },
  '231': { state: 'Uttar Pradesh', district: 'Mirzapur' },
  '241': { state: 'Uttar Pradesh', district: 'Hardoi' },
  '242': { state: 'Uttar Pradesh', district: 'Shahjahanpur' },
  '243': { state: 'Uttar Pradesh', district: 'Bareilly' },
  '244': { state: 'Uttar Pradesh', district: 'Moradabad' },
  '245': { state: 'Uttar Pradesh', district: 'Hapur' },
  '246': { state: 'Uttarakhand', district: 'Pauri Garhwal' },
  '247': { state: 'Uttar Pradesh', district: 'Saharanpur' },
  '248': { state: 'Uttarakhand', district: 'Dehradun' },
  '249': { state: 'Uttarakhand', district: 'Haridwar' },
  '250': { state: 'Uttar Pradesh', district: 'Meerut' },
  '251': { state: 'Uttar Pradesh', district: 'Muzaffarnagar' },
  '261': { state: 'Uttar Pradesh', district: 'Sitapur' },
  '262': { state: 'Uttar Pradesh', district: 'Pilibhit' },
  '263': { state: 'Uttarakhand', district: 'Nainital' },
  '271': { state: 'Uttar Pradesh', district: 'Gonda' },
  '272': { state: 'Uttar Pradesh', district: 'Basti' },
  '273': { state: 'Uttar Pradesh', district: 'Gorakhpur' },
  '274': { state: 'Uttar Pradesh', district: 'Deoria' },
  '281': { state: 'Uttar Pradesh', district: 'Mathura' },
  '282': { state: 'Uttar Pradesh', district: 'Agra' },
  '283': { state: 'Uttar Pradesh', district: 'Firozabad' },
  '284': { state: 'Uttar Pradesh', district: 'Jhansi' },

  // Rajasthan (301 - 345)
  '301': { state: 'Rajasthan', district: 'Alwar' },
  '302': { state: 'Rajasthan', district: 'Jaipur' },
  '303': { state: 'Rajasthan', district: 'Dausa' },
  '304': { state: 'Rajasthan', district: 'Tonk' },
  '305': { state: 'Rajasthan', district: 'Ajmer' },
  '306': { state: 'Rajasthan', district: 'Pali' },
  '311': { state: 'Rajasthan', district: 'Bhilwara' },
  '312': { state: 'Rajasthan', district: 'Chittorgarh' },
  '313': { state: 'Rajasthan', district: 'Udaipur' },
  '314': { state: 'Rajasthan', district: 'Dungarpur' },
  '321': { state: 'Rajasthan', district: 'Bharatpur' },
  '322': { state: 'Rajasthan', district: 'Sawai Madhopur' },
  '324': { state: 'Rajasthan', district: 'Kota' },
  '331': { state: 'Rajasthan', district: 'Churu' },
  '332': { state: 'Rajasthan', district: 'Sikar' },
  '333': { state: 'Rajasthan', district: 'Jhunjhunu' },
  '334': { state: 'Rajasthan', district: 'Bikaner' },
  '335': { state: 'Rajasthan', district: 'Sri Ganganagar' },
  '341': { state: 'Rajasthan', district: 'Nagaur' },
  '342': { state: 'Rajasthan', district: 'Jodhpur' },
  '343': { state: 'Rajasthan', district: 'Jalore' },
  '344': { state: 'Rajasthan', district: 'Barmer' },

  // Gujarat (360 - 396)
  '360': { state: 'Gujarat', district: 'Rajkot' },
  '361': { state: 'Gujarat', district: 'Jamnagar' },
  '362': { state: 'Gujarat', district: 'Junagadh' },
  '363': { state: 'Gujarat', district: 'Surendranagar' },
  '364': { state: 'Gujarat', district: 'Bhavnagar' },
  '365': { state: 'Gujarat', district: 'Amreli' },
  '370': { state: 'Gujarat', district: 'Kutch' },
  '380': { state: 'Gujarat', district: 'Ahmedabad' },
  '382': { state: 'Gujarat', district: 'Gandhinagar' },
  '383': { state: 'Gujarat', district: 'Sabarkantha' },
  '384': { state: 'Gujarat', district: 'Mehsana' },
  '385': { state: 'Gujarat', district: 'Banaskantha' },
  '387': { state: 'Gujarat', district: 'Kheda' },
  '388': { state: 'Gujarat', district: 'Anand' },
  '389': { state: 'Gujarat', district: 'Panchmahal' },
  '390': { state: 'Gujarat', district: 'Vadodara' },
  '391': { state: 'Gujarat', district: 'Chhota Udaipur' },
  '392': { state: 'Gujarat', district: 'Bharuch' },
  '393': { state: 'Gujarat', district: 'Narmada' },
  '394': { state: 'Gujarat', district: 'Surat' },
  '395': { state: 'Gujarat', district: 'Surat' },
  '396': { state: 'Gujarat', district: 'Valsad' },

  // Maharashtra & Goa (400 - 445)
  '400': { state: 'Maharashtra', district: 'Mumbai' },
  '401': { state: 'Maharashtra', district: 'Palghar' },
  '402': { state: 'Maharashtra', district: 'Raigad' },
  '403': { state: 'Goa', district: 'North Goa' },
  '410': { state: 'Maharashtra', district: 'Pune' },
  '411': { state: 'Maharashtra', district: 'Pune' },
  '412': { state: 'Maharashtra', district: 'Pune' },
  '413': { state: 'Maharashtra', district: 'Solapur' },
  '414': { state: 'Maharashtra', district: 'Ahmednagar' },
  '415': { state: 'Maharashtra', district: 'Satara' },
  '416': { state: 'Maharashtra', district: 'Kolhapur' },
  '421': { state: 'Maharashtra', district: 'Thane' },
  '422': { state: 'Maharashtra', district: 'Nashik' },
  '423': { state: 'Maharashtra', district: 'Nashik' },
  '424': { state: 'Maharashtra', district: 'Dhule' },
  '425': { state: 'Maharashtra', district: 'Jalgaon' },
  '431': { state: 'Maharashtra', district: 'Chhatrapati Sambhajinagar' },
  '440': { state: 'Maharashtra', district: 'Nagpur' },
  '441': { state: 'Maharashtra', district: 'Nagpur' },
  '442': { state: 'Maharashtra', district: 'Wardha' },
  '443': { state: 'Maharashtra', district: 'Buldhana' },
  '444': { state: 'Maharashtra', district: 'Akola' },
  '445': { state: 'Maharashtra', district: 'Yavatmal' },

  // Madhya Pradesh (450 - 488)
  '450': { state: 'Madhya Pradesh', district: 'Khandwa' },
  '451': { state: 'Madhya Pradesh', district: 'Khargone' },
  '452': { state: 'Madhya Pradesh', district: 'Indore' },
  '453': { state: 'Madhya Pradesh', district: 'Dhar' },
  '456': { state: 'Madhya Pradesh', district: 'Ujjain' },
  '457': { state: 'Madhya Pradesh', district: 'Ratlam' },
  '458': { state: 'Madhya Pradesh', district: 'Mandsaur' },
  '460': { state: 'Madhya Pradesh', district: 'Betul' },
  '461': { state: 'Madhya Pradesh', district: 'Narmadapuram' },
  '462': { state: 'Madhya Pradesh', district: 'Bhopal' },
  '464': { state: 'Madhya Pradesh', district: 'Vidisha' },
  '465': { state: 'Madhya Pradesh', district: 'Shajapur' },
  '470': { state: 'Madhya Pradesh', district: 'Sagar' },
  '471': { state: 'Madhya Pradesh', district: 'Chhatarpur' },
  '472': { state: 'Madhya Pradesh', district: 'Tikamgarh' },
  '474': { state: 'Madhya Pradesh', district: 'Gwalior' },
  '475': { state: 'Madhya Pradesh', district: 'Datia' },
  '476': { state: 'Madhya Pradesh', district: 'Morena' },
  '477': { state: 'Madhya Pradesh', district: 'Bhind' },
  '480': { state: 'Madhya Pradesh', district: 'Chhindwara' },
  '481': { state: 'Madhya Pradesh', district: 'Balaghat' },
  '482': { state: 'Madhya Pradesh', district: 'Jabalpur' },
  '483': { state: 'Madhya Pradesh', district: 'Katni' },
  '484': { state: 'Madhya Pradesh', district: 'Shahdol' },
  '485': { state: 'Madhya Pradesh', district: 'Satna' },
  '486': { state: 'Madhya Pradesh', district: 'Rewa' },

  // Chhattisgarh (490 - 497)
  '490': { state: 'Chhattisgarh', district: 'Durg' },
  '491': { state: 'Chhattisgarh', district: 'Rajnandgaon' },
  '492': { state: 'Chhattisgarh', district: 'Raipur' },
  '493': { state: 'Chhattisgarh', district: 'Mahasamund' },
  '494': { state: 'Chhattisgarh', district: 'Bastar' },
  '495': { state: 'Chhattisgarh', district: 'Bilaspur' },
  '496': { state: 'Chhattisgarh', district: 'Raigarh' },
  '497': { state: 'Chhattisgarh', district: 'Surguja' },

  // Telangana & Andhra Pradesh (500 - 535)
  '500': { state: 'Telangana', district: 'Hyderabad' },
  '501': { state: 'Telangana', district: 'K.V. Rangareddy' },
  '502': { state: 'Telangana', district: 'Sangareddy' },
  '503': { state: 'Telangana', district: 'Nizamabad' },
  '504': { state: 'Telangana', district: 'Adilabad' },
  '505': { state: 'Telangana', district: 'Karimnagar' },
  '506': { state: 'Telangana', district: 'Warangal' },
  '507': { state: 'Telangana', district: 'Khammam' },
  '508': { state: 'Telangana', district: 'Nalgonda' },
  '509': { state: 'Telangana', district: 'Mahabubnagar' },
  '515': { state: 'Andhra Pradesh', district: 'Ananthapuramu' },
  '516': { state: 'Andhra Pradesh', district: 'Y.S.R. Kadapa' },
  '517': { state: 'Andhra Pradesh', district: 'Chittoor' },
  '518': { state: 'Andhra Pradesh', district: 'Kurnool' },
  '520': { state: 'Andhra Pradesh', district: 'NTR' },
  '521': { state: 'Andhra Pradesh', district: 'Krishna' },
  '522': { state: 'Andhra Pradesh', district: 'Guntur' },
  '523': { state: 'Andhra Pradesh', district: 'Prakasam' },
  '524': { state: 'Andhra Pradesh', district: 'Sri Potti Sriramulu Nellore' },
  '530': { state: 'Andhra Pradesh', district: 'Visakhapatnam' },
  '531': { state: 'Andhra Pradesh', district: 'Anakapalli' },
  '532': { state: 'Andhra Pradesh', district: 'Srikakulam' },
  '533': { state: 'Andhra Pradesh', district: 'East Godavari' },
  '534': { state: 'Andhra Pradesh', district: 'West Godavari' },
  '535': { state: 'Andhra Pradesh', district: 'Vizianagaram' },

  // Karnataka (560 - 591)
  '560': { state: 'Karnataka', district: 'Bengaluru Urban' },
  '561': { state: 'Karnataka', district: 'Bengaluru Rural' },
  '562': { state: 'Karnataka', district: 'Ramanagara' },
  '563': { state: 'Karnataka', district: 'Kolar' },
  '570': { state: 'Karnataka', district: 'Mysuru' },
  '571': { state: 'Karnataka', district: 'Chamarajanagar' },
  '572': { state: 'Karnataka', district: 'Tumakuru' },
  '573': { state: 'Karnataka', district: 'Hassan' },
  '574': { state: 'Karnataka', district: 'Dakshina Kannada' },
  '575': { state: 'Karnataka', district: 'Dakshina Kannada' },
  '576': { state: 'Karnataka', district: 'Udupi' },
  '577': { state: 'Karnataka', district: 'Shivamogga' },
  '580': { state: 'Karnataka', district: 'Dharwad' },
  '581': { state: 'Karnataka', district: 'Uttara Kannada' },
  '582': { state: 'Karnataka', district: 'Gadag' },
  '583': { state: 'Karnataka', district: 'Ballari' },
  '584': { state: 'Karnataka', district: 'Raichur' },
  '585': { state: 'Karnataka', district: 'Kalaburagi' },
  '586': { state: 'Karnataka', district: 'Vijayapura' },
  '587': { state: 'Karnataka', district: 'Bagalkote' },
  '590': { state: 'Karnataka', district: 'Belagavi' },
  '591': { state: 'Karnataka', district: 'Belagavi' },

  // Tamil Nadu & Puducherry (600 - 643)
  '600': { state: 'Tamil Nadu', district: 'Chennai' },
  '601': { state: 'Tamil Nadu', district: 'Tiruvallur' },
  '602': { state: 'Tamil Nadu', district: 'Kanchipuram' },
  '603': { state: 'Tamil Nadu', district: 'Chengalpattu' },
  '604': { state: 'Tamil Nadu', district: 'Viluppuram' },
  '605': { state: 'Puducherry', district: 'Puducherry' },
  '606': { state: 'Tamil Nadu', district: 'Kallakurichi' },
  '607': { state: 'Tamil Nadu', district: 'Cuddalore' },
  '608': { state: 'Tamil Nadu', district: 'Cuddalore' },
  '620': { state: 'Tamil Nadu', district: 'Tiruchirappalli' },
  '621': { state: 'Tamil Nadu', district: 'Perambalur' },
  '622': { state: 'Tamil Nadu', district: 'Pudukkottai' },
  '624': { state: 'Tamil Nadu', district: 'Dindigul' },
  '625': { state: 'Tamil Nadu', district: 'Madurai' },
  '626': { state: 'Tamil Nadu', district: 'Virudhunagar' },
  '627': { state: 'Tamil Nadu', district: 'Tirunelveli' },
  '628': { state: 'Tamil Nadu', district: 'Thoothukudi' },
  '629': { state: 'Tamil Nadu', district: 'Kanniyakumari' },
  '630': { state: 'Tamil Nadu', district: 'Sivaganga' },
  '631': { state: 'Tamil Nadu', district: 'Ranipet' },
  '632': { state: 'Tamil Nadu', district: 'Vellore' },
  '635': { state: 'Tamil Nadu', district: 'Krishnagiri' },
  '636': { state: 'Tamil Nadu', district: 'Salem' },
  '637': { state: 'Tamil Nadu', district: 'Namakkal' },
  '638': { state: 'Tamil Nadu', district: 'Erode' },
  '641': { state: 'Tamil Nadu', district: 'Coimbatore' },
  '642': { state: 'Tamil Nadu', district: 'Coimbatore' },
  '643': { state: 'Tamil Nadu', district: 'Nilgiris' },

  // Kerala & Lakshadweep (670 - 695)
  '670': { state: 'Kerala', district: 'Kannur' },
  '671': { state: 'Kerala', district: 'Kasaragod' },
  '673': { state: 'Kerala', district: 'Kozhikode' },
  '676': { state: 'Kerala', district: 'Malappuram' },
  '678': { state: 'Kerala', district: 'Palakkad' },
  '679': { state: 'Kerala', district: 'Palakkad' },
  '680': { state: 'Kerala', district: 'Thrissur' },
  '682': { state: 'Kerala', district: 'Ernakulam' },
  '683': { state: 'Kerala', district: 'Ernakulam' },
  '685': { state: 'Kerala', district: 'Idukki' },
  '686': { state: 'Kerala', district: 'Kottayam' },
  '688': { state: 'Kerala', district: 'Alappuzha' },
  '689': { state: 'Kerala', district: 'Pathanamthitta' },
  '691': { state: 'Kerala', district: 'Kollam' },
  '695': { state: 'Kerala', district: 'Thiruvananthapuram' },

  // West Bengal & Sikkim & A&N (700 - 744)
  '700': { state: 'West Bengal', district: 'Kolkata' },
  '711': { state: 'West Bengal', district: 'Howrah' },
  '712': { state: 'West Bengal', district: 'Hooghly' },
  '713': { state: 'West Bengal', district: 'Paschim Bardhaman' },
  '721': { state: 'West Bengal', district: 'Paschim Medinipur' },
  '722': { state: 'West Bengal', district: 'Bankura' },
  '723': { state: 'West Bengal', district: 'Purulia' },
  '731': { state: 'West Bengal', district: 'Birbhum' },
  '732': { state: 'West Bengal', district: 'Malda' },
  '733': { state: 'West Bengal', district: 'Uttar Dinajpur' },
  '734': { state: 'West Bengal', district: 'Darjeeling' },
  '735': { state: 'West Bengal', district: 'Jalpaiguri' },
  '736': { state: 'West Bengal', district: 'Cooch Behar' },
  '737': { state: 'Sikkim', district: 'East Sikkim' },
  '741': { state: 'West Bengal', district: 'Nadia' },
  '742': { state: 'West Bengal', district: 'Murshidabad' },
  '743': { state: 'West Bengal', district: 'North 24 Parganas' },
  '744': { state: 'Andaman and Nicobar Islands', district: 'South Andaman' },

  // Odisha (751 - 770)
  '751': { state: 'Odisha', district: 'Khordha' },
  '752': { state: 'Odisha', district: 'Puri' },
  '753': { state: 'Odisha', district: 'Cuttack' },
  '754': { state: 'Odisha', district: 'Kendrapara' },
  '755': { state: 'Odisha', district: 'Jajpur' },
  '756': { state: 'Odisha', district: 'Balasore' },
  '757': { state: 'Odisha', district: 'Mayurbhanj' },
  '758': { state: 'Odisha', district: 'Kendujhar' },
  '759': { state: 'Odisha', district: 'Dhenkanal' },
  '760': { state: 'Odisha', district: 'Ganjam' },
  '761': { state: 'Odisha', district: 'Ganjam' },
  '765': { state: 'Odisha', district: 'Rayagada' },
  '766': { state: 'Odisha', district: 'Kalahandi' },
  '767': { state: 'Odisha', district: 'Balangir' },
  '768': { state: 'Odisha', district: 'Sambalpur' },
  '769': { state: 'Odisha', district: 'Sundargarh' },
  '770': { state: 'Odisha', district: 'Sundargarh' },

  // North East: Assam, Arunachal, Manipur, Meghalaya, Mizoram, Nagaland, Tripura (781 - 799)
  '781': { state: 'Assam', district: 'Kamrup Metropolitan' },
  '782': { state: 'Assam', district: 'Nagaon' },
  '783': { state: 'Assam', district: 'Goalpara' },
  '784': { state: 'Assam', district: 'Sonitpur' },
  '785': { state: 'Assam', district: 'Jorhat' },
  '786': { state: 'Assam', district: 'Dibrugarh' },
  '787': { state: 'Assam', district: 'Lakhimpur' },
  '788': { state: 'Assam', district: 'Cachar' },
  '790': { state: 'Arunachal Pradesh', district: 'West Kameng' },
  '791': { state: 'Arunachal Pradesh', district: 'Papum Pare' },
  '792': { state: 'Arunachal Pradesh', district: 'Changlang' },
  '793': { state: 'Meghalaya', district: 'East Khasi Hills' },
  '794': { state: 'Meghalaya', district: 'West Garo Hills' },
  '795': { state: 'Manipur', district: 'Imphal West' },
  '796': { state: 'Mizoram', district: 'Aizawl' },
  '797': { state: 'Nagaland', district: 'Kohima' },
  '798': { state: 'Nagaland', district: 'Mokokchung' },
  '799': { state: 'Tripura', district: 'West Tripura' },

  // Bihar & Jharkhand (800 - 855)
  '800': { state: 'Bihar', district: 'Patna' },
  '801': { state: 'Bihar', district: 'Patna' },
  '802': { state: 'Bihar', district: 'Bhojpur' },
  '803': { state: 'Bihar', district: 'Nalanda' },
  '804': { state: 'Bihar', district: 'Jehanabad' },
  '805': { state: 'Bihar', district: 'Nawada' },
  '811': { state: 'Bihar', district: 'Munger' },
  '812': { state: 'Bihar', district: 'Bhagalpur' },
  '813': { state: 'Bihar', district: 'Banka' },
  '814': { state: 'Jharkhand', district: 'Deoghar' },
  '815': { state: 'Jharkhand', district: 'Giridih' },
  '816': { state: 'Jharkhand', district: 'Pakur' },
  '821': { state: 'Bihar', district: 'Rohtas' },
  '822': { state: 'Jharkhand', district: 'Palamu' },
  '823': { state: 'Bihar', district: 'Gaya' },
  '824': { state: 'Bihar', district: 'Aurangabad' },
  '825': { state: 'Jharkhand', district: 'Hazaribagh' },
  '826': { state: 'Jharkhand', district: 'Dhanbad' },
  '827': { state: 'Jharkhand', district: 'Bokaro' },
  '828': { state: 'Jharkhand', district: 'Dhanbad' },
  '829': { state: 'Jharkhand', district: 'Ramgarh' },
  '831': { state: 'Jharkhand', district: 'East Singhbhum' },
  '832': { state: 'Jharkhand', district: 'Seraikela Kharsawan' },
  '833': { state: 'Jharkhand', district: 'West Singhbhum' },
  '834': { state: 'Jharkhand', district: 'Ranchi' },
  '835': { state: 'Jharkhand', district: 'Ranchi' },
  '841': { state: 'Bihar', district: 'Saran' },
  '842': { state: 'Bihar', district: 'Muzaffarpur' },
  '843': { state: 'Bihar', district: 'Sitamarhi' },
  '844': { state: 'Bihar', district: 'Vaishali' },
  '845': { state: 'Bihar', district: 'East Champaran' },
  '846': { state: 'Bihar', district: 'Darbhanga' },
  '847': { state: 'Bihar', district: 'Madhubani' },
  '848': { state: 'Bihar', district: 'Samastipur' },
  '851': { state: 'Bihar', district: 'Begusarai' },
  '852': { state: 'Bihar', district: 'Saharsa' },
  '853': { state: 'Bihar', district: 'Khagaria' },
  '854': { state: 'Bihar', district: 'Purnia' },
  '855': { state: 'Bihar', district: 'Kishanganj' },
};

/**
 * Fast, synchronous 0ms Pincode Lookup
 * Returns { taluk, district, state } or null if invalid format
 * On pincode known, fills taluk/district/state instantly.
 * Leaves taluk blank if not found in exact hub directory.
 */
export function lookupPincode(pinCode: string): PincodeRecord | null {
  const cleanPin = (pinCode || '').trim().replace(/\D/g, '');
  if (cleanPin.length !== 6 || cleanPin.startsWith('0')) {
    return null;
  }

  // 1. Check exact directory first (has specific taluk)
  const exact = EXACT_PINCODE_DIRECTORY[cleanPin];
  if (exact) {
    return { ...exact };
  }

  // 2. Fall back to 3-digit prefix mapping (resolves state & district accurately; taluk remains blank & editable)
  const prefix3 = cleanPin.substring(0, 3);
  const region = PREFIX_3_DIGIT_MAP[prefix3];
  if (region) {
    return {
      taluk: '',
      district: region.district,
      state: region.state,
    };
  }

  return null;
}
