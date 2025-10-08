import axios from 'axios';

/**
 * TimeModule: Displays the current local time and date for a specified city.
 * Optionally includes weather if the OpenWeatherMap API key is configured.
 */
class TimeModule {
  constructor(bot) {
    this.bot = bot;
    this.name = 'time';
    this.metadata = {
      description: 'Shows current local time, date, timezone, and (optionally) weather for a city.',
      version: '2.1.0',
      author: 'HyperWa Team',
      category: 'utility',
    };

    // --- API CREDENTIALS ---
    // Geonames is required.
    this.geoApiUsername = 'tahseen'; // Get from geonames.org

    // Weather is optional. Leave as is to disable.
    this.weatherApiKey = '3ec738bcb912c44a805858054ead1efd'; // Get from openweathermap.org
    // ---------------------------------------------

    this.defaultLocation = 'Los Angeles';

    this.WEATHER_EMOJIS = {
      "clear sky": "☀️", "few clouds": "🌤️", "scattered clouds": "⛅️",
      "broken clouds": "☁️", "overcast clouds": "🌥️", "light rain": "🌧️",
      "moderate rain": "🌧️", "heavy intensity rain": "🌧️", "shower rain": "🌧️",
      "thunderstorm": "⛈️", "snow": "🌨️", "light snow": "🌨️",
      "shower snow": "🌨️", "mist": "🌫️", "haze": "🌫️", "smoke": "💨",
    };

    this.commands = [{
      name: 'time',
      description: 'Shows the current time, date, and (if configured) weather for a city.',
      usage: '.time [city name]',
      aliases: ['t'],
      permissions: 'public',
      ui: {
        processingText: '⏳ Fetching geo-data...',
        errorText: '❌ An unexpected error occurred.',
      },
      execute: this.timeCommand.bind(this),
    }];
  }

  /**
   * Main command executor. Orchestrates API calls and formats the final output.
   */
  async timeCommand(msg, params, context) {
    const location = params.length > 0 ? params.join(' ') : this.defaultLocation;

    if (!this.geoApiUsername || this.geoApiUsername === 'your_geonames_username') {
      return '❌ Geonames API username must be configured in the TimeModule.';
    }

    try {
      // Basic time/date info is always fetched
      const { lat, lng } = await this._getCoordinates(location);
      const timezoneData = await this._getTimezoneData(lat, lng);
      const timezoneId = timezoneData.timezoneId;

      // **MODIFIED LOGIC STARTS HERE**
      let weatherLine = ''; // Initialize weather line as an empty string
      const isWeatherConfigured = this.weatherApiKey && this.weatherApiKey !== 'your_openweathermap_api_key';

      // Only fetch and format weather if the API key is set
      if (isWeatherConfigured) {
        const weatherData = await this._getWeatherData(location);
        if (weatherData && weatherData.weather) {
          const temp = weatherData.main.temp;
          const description = weatherData.weather[0].description;
          const emoji = this.WEATHER_EMOJIS[description.toLowerCase()] || "";
          const summaryText = `WX: ${description.charAt(0).toUpperCase() + description.slice(1)} ${temp}°C ${emoji}`.trim();
          // Format the entire line, including newline and bolding
          weatherLine = `\n*${summaryText}*`;
        }
      }
      // **MODIFIED LOGIC ENDS HERE**

      // Format date and time
      const now = new Date();
      const time24 = now.toLocaleTimeString('en-GB', { timeZone: timezoneId });
      const time12 = now.toLocaleTimeString('en-US', { timeZone: timezoneId, hour: 'numeric', minute: '2-digit', hour12: true });
      const date = now.toLocaleDateString('en-US', { timeZone: timezoneId, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long' });

      // Assemble the final response
      return (
        `*Currently in ${location},${timezoneData.countryName}:*\n\n` +
        `*Time:* ${time12} | ${time24}\n` +
        `*Date:* ${date}\n` +
        `*Timezone:* ${timezoneId}` +
        `${weatherLine}` // Append the weather line. If not configured, this is empty.
      );

    } catch (error) {
      return `❌ Failed to fetch time for "${location}": ${error.message}`;
    }
  }

  // --- Helper functions (_getCoordinates, _getTimezoneData, _getWeatherData) remain the same ---

  async _getCoordinates(location) {
    const url = 'http://api.geonames.org/searchJSON';
    const params = { q: location, username: this.geoApiUsername, maxRows: 1 };
    try {
      const response = await axios.get(url, { params });
      if (response.data.geonames && response.data.geonames.length > 0) {
        return { lat: response.data.geonames[0].lat, lng: response.data.geonames[0].lng };
      }
      throw new Error('City not found.');
    } catch (err) {
      throw new Error('Geonames API error or city not found.');
    }
  }

  async _getTimezoneData(lat, lng) {
    const url = 'http://api.geonames.org/timezoneJSON';
    const params = { lat, lng, username: this.geoApiUsername };
    try {
      const response = await axios.get(url, { params });
      if (response.data.timezoneId) {
        return response.data;
      }
      throw new Error('Could not determine timezone.');
    } catch (err) {
      throw new Error('Geonames timezone API error.');
    }
  }

  async _getWeatherData(location) {
    const url = 'http://api.openweathermap.org/data/2.5/weather';
    const params = { q: location, appid: this.weatherApiKey, units: 'metric' };
    try {
      const response = await axios.get(url, { params });
      return response.data;
    } catch (err) {
      console.error("OpenWeatherMap API error:", err.response?.data?.message || err.message);
      return null;
    }
  }
}

export default TimeModule;
