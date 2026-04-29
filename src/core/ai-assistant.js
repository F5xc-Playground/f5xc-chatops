class AIAssistant {
  constructor(xcClient) {
    this._client = xcClient;
  }

  async query(namespace, queryText) {
    return this._client.post(`/api/gen-ai/namespaces/${namespace}/query`, {
      current_query: queryText,
      namespace,
    });
  }

  async feedback(namespace, queryId, queryText, positive, remark) {
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

    return this._client.post(
      `/api/gen-ai/namespaces/${namespace}/query_feedback`,
      body
    );
  }
}

module.exports = { AIAssistant };
