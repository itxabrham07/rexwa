import axios from 'axios';
import * as cheerio from 'cheerio'; // FIX: Changed to namespace import

class GoogleSearchModule {
    constructor(bot) {
        this.bot = bot;
        this.name = 'google';
        this.metadata = {
            description: 'Advanced Google search with web scraping - no API required',
            version: '2.0.0',
            author: 'HyperWa Team',
            category: 'search'
        };
        
        this.commands = [
            {
                name: 'google',
                description: 'Search Google for web results',
                usage: '.google <query>',
                aliases: ['g', 'search'],
                permissions: 'public',
                ui: {
                    processingText: '🔍 *Searching Google...*\n\n⏳ Scraping search results...',
                    errorText: '❌ *Google Search Failed*'
                },
                execute: this.googleSearch.bind(this)
            },
            {
                name: 'images',
                description: 'Search Google Images',
                usage: '.images <query>',
                aliases: ['img', 'pic'],
                permissions: 'public',
                ui: {
                    processingText: '🖼️ *Searching Images...*\n\n⏳ Finding visual content...',
                    errorText: '❌ *Image Search Failed*'
                },
                execute: this.imageSearch.bind(this)
            },
            {
                name: 'news',
                description: 'Search Google News',
                usage: '.news <query>',
                permissions: 'public',
                ui: {
                    processingText: '📰 *Searching News...*\n\n⏳ Getting latest updates...',
                    errorText: '❌ *News Search Failed*'
                },
                execute: this.newsSearch.bind(this)
            },
            {
                name: 'lucky',
                description: 'I\'m Feeling Lucky search',
                usage: '.lucky <query>',
                permissions: 'public',
                ui: {
                    processingText: '🍀 *Feeling Lucky...*\n\n⏳ Getting top result...',
                    errorText: '❌ *Lucky Search Failed*'
                },
                execute: this.luckySearch.bind(this)
            },
            {
                name: 'define',
                description: 'Get definition from Google',
                usage: '.define <word>',
                permissions: 'public',
                ui: {
                    processingText: '📚 *Looking up definition...*\n\n⏳ Searching dictionary...',
                    errorText: '❌ *Definition Search Failed*'
                },
                execute: this.defineWord.bind(this)
            }
        ];
    }

    async googleSearch(msg, params, context) {
        if (params.length === 0) {
            return '❌ *Google Search*\n\nPlease provide a search query.\n\n💡 Usage: `.google <query>`\n📝 Example: `.google JavaScript tutorials`';
        }

        const query = params.join(' ');

        try {
            const response = await axios.get('https://www.google.com/search', {
                params: { q: query, num: 10 },
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });

            const $ = cheerio.load(response.data); // FIX: Uses cheerio.load
            const results = [];

            $('div.g').each((i, element) => {
                if (results.length >= 5) return false;
                
                const title = $(element).find('h3').text();
                const link = $(element).find('a').first().attr('href');
                const snippet = $(element).find('.VwiC3b').text() || $(element).find('.s3v9rd').text();

                if (title && link) {
                    results.push({ title, link, snippet });
                }
            });

            if (results.length === 0) {
                return `❌ *No Results Found*\n\nNo search results for "${query}".`;
            }

            let searchText = `🔍 *Google Search Results*\n\n📝 Query: "${query}"\n\n`;
            
            results.forEach((result, index) => {
                searchText += `${index + 1}. **${result.title}**\n`;
                searchText += `🔗 ${result.link}\n`;
                if (result.snippet) {
                    searchText += `📄 ${result.snippet.substring(0, 100)}...\n`;
                }
                searchText += `\n`;
            });

            searchText += `⏰ Search completed at ${new Date().toLocaleTimeString()}`;
            return searchText;

        } catch (error) {
            throw new Error(`Google search failed: ${error.message}`);
        }
    }

    async imageSearch(msg, params, context) {
        if (params.length === 0) {
            return '❌ *Image Search*\n\nPlease provide a search query.\n\n💡 Usage: `.images <query>`\n📝 Example: `.images cute cats`';
        }

        const query = params.join(' ');

        try {
            const response = await axios.get('https://www.google.com/search', {
                params: { 
                    q: query, 
                    tbm: 'isch',
                    safe: 'active'
                },
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const $ = cheerio.load(response.data); // FIX: Uses cheerio.load
            const images = [];

            $('img').each((i, element) => {
                if (images.length >= 5) return false;
                
                const src = $(element).attr('src');
                const alt = $(element).attr('alt');
                
                if (src && src.startsWith('http') && alt) {
                    images.push({ src, alt });
                }
            });

            if (images.length === 0) {
                return `❌ *No Images Found*\n\nNo image results for "${query}".`;
            }

            // Send first image
            const firstImage = images[0];
            await context.bot.sendMessage(context.sender, {
                image: { url: firstImage.src },
                caption: `🖼️ *Image Search Result*\n\n📝 Query: "${query}"\n📄 ${firstImage.alt}\n\n⏰ ${new Date().toLocaleTimeString()}`
            });

            // Send list of other images
            let imageList = `🖼️ *More Image Results*\n\n📝 Query: "${query}"\n\n`;
            images.slice(1).forEach((img, index) => {
                imageList += `${index + 2}. ${img.alt}\n🔗 ${img.src}\n\n`;
            });

            return imageList;

        } catch (error) {
            throw new Error(`Image search failed: ${error.message}`);
        }
    }

    async newsSearch(msg, params, context) {
        if (params.length === 0) {
            return '❌ *News Search*\n\nPlease provide a search query.\n\n💡 Usage: `.news <query>`\n📝 Example: `.news technology`';
        }

        const query = params.join(' ');

        try {
            const response = await axios.get('https://www.google.com/search', {
                params: { 
                    q: query, 
                    tbm: 'nws',
                    num: 10
                },
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const $ = cheerio.load(response.data); // FIX: Uses cheerio.load
            const news = [];

            $('div.SoaBEf').each((i, element) => {
                if (news.length >= 5) return false;
                
                const title = $(element).find('div.MBeuO').text();
                const source = $(element).find('div.NUnG9d span').first().text();
                const time = $(element).find('div.NUnG9d span').last().text();
                const link = $(element).find('a').attr('href');
                const snippet = $(element).find('div.GI74Re').text();

                if (title && source) {
                    news.push({ title, source, time, link, snippet });
                }
            });

            if (news.length === 0) {
                return `❌ *No News Found*\n\nNo news results for "${query}".`;
            }

            let newsText = `📰 *Google News Results*\n\n📝 Query: "${query}"\n\n`;
            
            news.forEach((article, index) => {
                newsText += `${index + 1}. **${article.title}**\n`;
                newsText += `📺 ${article.source}`;
                if (article.time) newsText += ` • ${article.time}`;
                newsText += `\n`;
                if (article.link) newsText += `🔗 ${article.link}\n`;
                if (article.snippet) newsText += `📄 ${article.snippet.substring(0, 100)}...\n`;
                newsText += `\n`;
            });

            newsText += `⏰ Search completed at ${new Date().toLocaleTimeString()}`;
            return newsText;

        } catch (error) {
            throw new Error(`News search failed: ${error.message}`);
        }
    }

    async luckySearch(msg, params, context) {
        if (params.length === 0) {
            return '❌ *I\'m Feeling Lucky*\n\nPlease provide a search query.\n\n💡 Usage: `.lucky <query>`\n📝 Example: `.lucky best pizza recipe`';
        }

        const query = params.join(' ');

        try {
            const response = await axios.get('https://www.google.com/search', {
                params: { q: query, btnI: 'I' },
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                maxRedirects: 0,
                validateStatus: (status) => status < 400
            });

            const finalUrl = response.request.res.responseUrl || response.config.url;
            
            return `🍀 *I'm Feeling Lucky Result*\n\n📝 Query: "${query}"\n🎯 Top Result: ${finalUrl}\n\n⏰ ${new Date().toLocaleTimeString()}`;

        } catch (error) {
            if (error.response && error.response.headers.location) {
                return `🍀 *I'm Feeling Lucky Result*\n\n📝 Query: "${query}"\n🎯 Top Result: ${error.response.headers.location}\n\n⏰ ${new Date().toLocaleTimeString()}`;
            }
            throw new Error(`Lucky search failed: ${error.message}`);
        }
    }

    async defineWord(msg, params, context) {
        if (params.length === 0) {
            return '❌ *Word Definition*\n\nPlease provide a word to define.\n\n💡 Usage: `.define <word>`\n📝 Example: `.define serendipity`';
        }

        const word = params.join(' ');

        try {
            const response = await axios.get('https://www.google.com/search', {
                params: { q: `define ${word}` },
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const $ = cheerio.load(response.data); // FIX: Uses cheerio.load
            
            // Try to find definition in Google's dictionary box
            const definition = $('div[data-dobid="dfn"]').text() || 
                            $('.BNeawe').first().text() ||
                            $('span[data-dobid="hdw"]').parent().next().text();

            const pronunciation = $('span[data-dobid="hdw"]').text();
            const partOfSpeech = $('div.YrbPuc').text();

            if (definition) {
                let defText = `📚 *Definition of "${word}"*\n\n`;
                if (pronunciation) defText += `🔊 Pronunciation: ${pronunciation}\n`;
                if (partOfSpeech) defText += `📝 Part of Speech: ${partOfSpeech}\n`;
                defText += `📖 Definition: ${definition}\n\n`;
                defText += `⏰ ${new Date().toLocaleTimeString()}`;
                
                return defText;
            } else {
                return `❌ *Definition Not Found*\n\nCouldn't find a definition for "${word}".`;
            }

        } catch (error) {
            throw new Error(`Definition search failed: ${error.message}`);
        }
    }
}

export default GoogleSearchModule;
