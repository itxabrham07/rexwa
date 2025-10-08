import axios from 'axios';

class WeatherModule {
    constructor(bot) {
        this.bot = bot;
        this.name = 'weather';
        this.metadata = {
            description: 'Get current weather or forecast for a city',
            version: '1.0.0',
            author: 'HyperWa Team',
            category: 'utility'
        };

        // Default config
        this.defaultCity = "kahror pakka, PK"; 
        this.apiKey = "3ec738bcb912c44a805858054ead1efd"; 

        this.commands = [
            {
                name: 'weather',
                description: 'Shows weather information and forecast',
                usage: '.weather [days] [city]',
                permissions: 'public',
                ui: {
                    processingText: '🌤️ *Fetching weather data...*',
                    errorText: '❌ *Failed to fetch weather data*'
                },
                execute: this.getWeather.bind(this)
            }
        ];
    }

    async getWeather(msg, params) {
        if (!this.apiKey || this.apiKey === "YOUR_OPENWEATHERMAP_API_KEY") {
            return "❌ Weather API key is missing. Please add it in weather.js.";
        }

        let days = 0;
        let city = this.defaultCity;

        // Parse params
        if (params.length > 0) {
            if (!isNaN(params[0])) {
                days = parseInt(params[0]);
                if (params.length > 1) {
                    city = params.slice(1).join(' ');
                }
            } else {
                city = params.join(' ');
            }
        }

        try {
            if (days > 0) {
                return await this.getForecast(city, days);
            } else {
                return await this.getCurrentWeather(city);
            }
        } catch (error) {
            console.error(error);
            return "❌ Failed to fetch weather data.";
        }
    }

    async getCurrentWeather(city) {
        const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${this.apiKey}&units=metric`;
        const { data } = await axios.get(url);

        return `🌤️ *Current Weather in ${data.name}, ${data.sys.country}:*\n
🌡️ Temp: ${data.main.temp}°C
🤔 Feels Like: ${data.main.feels_like}°C
💧 Humidity: ${data.main.humidity}%
🌬️ Wind: ${data.wind.speed} m/s
☁️ Condition: ${data.weather[0].description}`;
    }

    async getForecast(city, days) {
        if (days < 1) days = 1;
        if (days > 7) days = 7; // limit for free tier
        const url = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&appid=${this.apiKey}&units=metric`;
        const { data } = await axios.get(url);

        // Group forecasts by day
        const dailyData = {};
        data.list.forEach(entry => {
            const date = entry.dt_txt.split(' ')[0];
            if (!dailyData[date]) dailyData[date] = [];
            dailyData[date].push(entry);
        });

        const forecastDays = Object.keys(dailyData).slice(0, days);
        let result = `📅 *${days}-Day Forecast for ${data.city.name}, ${data.city.country}:*\n`;

        forecastDays.forEach(date => {
            const dayEntries = dailyData[date];
            const avgTemp = (dayEntries.reduce((sum, e) => sum + e.main.temp, 0) / dayEntries.length).toFixed(1);
            const description = dayEntries[0].weather[0].description;
            result += `\n📆 ${date} → 🌡️ ${avgTemp}°C, ${description}`;
        });

        return result;
    }
}

export default WeatherModule;
