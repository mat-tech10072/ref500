/** Static storefront data adapter. No network or backend is required. */
const LufaApi = (() => {
    const categories = window.__LUFA_BOOTSTRAP_CATEGORIES || [];
    const products = [
        {id:'prod_dev_001',name:'Sample Beaded Necklace',description:'Development sample product. Not a real listing.',price:'120.00',category_id:'cat_jewelry',category_code:'JWL',product_code:'DEV-001',image_path:'',featured:1,stock:10,category_name:'Jewelry',category_slug:'jewelry',category_care:'Store in a dry place. Avoid contact with perfume and water.',sizes:[],image_url:null,image_exists:false,image_missing:false},
        {id:'prod_dev_002',name:'Sample Highland Bilum',description:'Development sample product. Not a real listing.',price:'245.00',category_id:'cat_bilums',category_code:'BLM',product_code:'DEV-002',image_path:'',featured:1,stock:5,category_name:'Bilums',category_slug:'bilums',category_care:'Hang loosely when not in use. Spot-clean with a damp cloth.',sizes:[{id:1,product_id:'prod_dev_002',variant_code:'',sku:'',is_active:1,name:'Small',price:'245.00',sort_order:1},{id:2,product_id:'prod_dev_002',variant_code:'',sku:'',is_active:1,name:'Large',price:'310.00',sort_order:2}],image_url:null,image_exists:false,image_missing:false},
        {id:'prod_dev_003',name:'Sample Coin Purse',description:'Development sample product. Not a real listing.',price:'60.00',category_id:'cat_handycraft',category_code:'HCR',product_code:'DEV-003',image_path:'',featured:0,stock:25,category_name:'Handy Craft',category_slug:'handy-craft',category_care:'Handle with care. Keep away from direct moisture and prolonged sunlight.',sizes:[],image_url:null,image_exists:false,image_missing:false},
        {id:'prod_dev_004',name:'Sample Gift Bundle',description:'Development sample product. Not a real listing.',price:'350.00',category_id:'cat_giftpacks',category_code:'GFT',product_code:'DEV-004',image_path:'',featured:1,stock:3,category_name:'Gift Packs',category_slug:'gift-packs',category_care:'Care depends on the items included; see each product.',sizes:[],image_url:null,image_exists:false,image_missing:false},
        {id:'prod_dev_005',name:'Sample Woven Bracelet',description:'Development sample product. Not a real listing.',price:'45.00',category_id:'cat_jewelry',category_code:'JWL',product_code:'DEV-005',image_path:'',featured:0,stock:40,category_name:'Jewelry',category_slug:'jewelry',category_care:'Store in a dry place. Avoid contact with perfume and water.',sizes:[],image_url:null,image_exists:false,image_missing:false}
    ];
    const cms = window.__LUFA_BOOTSTRAP_CMS || {hero:{},about:{},storefront:{},blog:{}};
    const settings = window.__LUFA_SETTINGS || {};
    const filterProducts = (params={}) => {
        let list = products.slice();
        const term = String(params.q || params.search || '').toLowerCase();
        if (term) list = list.filter(p => `${p.name} ${p.description}`.toLowerCase().includes(term));
        const category = params.category || params.category_id;
        if (category) list = list.filter(p => p.category_id === category || p.category_slug === category);
        return list;
    };
    const unavailable = async () => ({success:false,static:true,error:'This standalone frontend does not submit data.'});
    return {
        V2_BASE: '', getContentVersion: async () => ({hash:window.__LUFA_CONTENT_HASH || 'static'}),
        getProducts: async (params={}) => ({products:filterProducts(params),pagination:null}),
        getFeaturedProducts: async (limit=12) => products.filter(p=>p.featured).slice(0,limit),
        getProduct: async id => products.find(p=>p.id===id) || null,
        searchProducts: async (term,params={}) => ({products:filterProducts({...params,q:term}),pagination:null,query:term}),
        getCategories: async () => categories.slice(), getCmsPages: async () => cms, getCmsHome: async () => cms,
        getCmsLegal: async () => ({}), getSettingsPublic: async () => settings, getFaqs: async () => [],
        getCare: async () => [], getBlog: async () => ({posts:[],pagination:null}), getSocialFeed: async () => [],
        submitContact: unavailable, subscribeNewsletter: unavailable, quoteCart: unavailable,
        validateCart: unavailable, createOrder: unavailable, getDeliveryOptions: async () => null,
        getFumigationRates: async () => [], getCountries: async () => [], newIdempotencyKey: () => 'static-' + Date.now(),
        normalizeCmsToLegacyShape: value => value
    };
})();
