class AIAssistant {
  constructor(xcClient) {
    this._client = xcClient;
  }

  async query(namespace, queryText) {
    const path = `/api/gen-ai/namespaces/${namespace}/query`;
    const body = { current_query: queryText, namespace };

    try {
      return await this._client.put(path, body);
    } catch (err) {
      if (err.status === 404 || err.status === 405) {
        return await this._client.post(path, body);
      }
      if (err.status === 403) {
        throw Object.assign(new Error('AI Assistant access denied. The API token may lack permissions for the gen-ai API.'), { status: 403 });
      }
      throw err;
    }
  }

  async feedback(namespace, queryId, queryText, positive, remark) {
    const path = `/api/gen-ai/namespaces/${namespace}/query_feedback`;
    const body = {
      namespace,
      query_id: queryId,
      query: queryText,
    };

    if (positive) {
      body.positive_feedback = {};
    } else {
      body.negative_feedback = {
        remarks: [remark || 'OTHER'],
      };
    }

    try {
      return await this._client.put(path, body);
    } catch (err) {
      if (err.status === 404 || err.status === 405) {
        return await this._client.post(path, body);
      }
      throw err;
    }
  }
}

module.exports = { AIAssistant };
