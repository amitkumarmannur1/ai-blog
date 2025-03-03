import express from 'express';
import { Anthropic } from '@anthropic-ai/sdk';
import { Octokit } from '@octokit/rest';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize API clients
const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

// Configure GitHub repository details
const GITHUB_USERNAME = process.env.GITHUB_USERNAME || 'your-username';
const GITHUB_REPO = process.env.GITHUB_REPO || 'ai-blog';
const GITHUB_BRANCH = 'main';

app.post('/generate', async (req, res) => {
  try {
    const { topic, title, model } = req.body;
    
    // Generate content using Claude
    const claudeResponse = await anthropic.messages.create({
      model: "claude-3-7-sonnet-20250219",
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: `Write a blog post about: ${topic}. 
                    Format it in Markdown with headers, subheaders, and proper formatting.
                    Make it engaging, informative, and about 1000-1500 words.
                    
                    Also generate 4 social media snippets for promoting this article.`
        }
      ]
    });
    
    const content = claudeResponse.content[0].text;
    
    // Extract social media snippets from content
    const socialSnippets = extractSocialSnippets(content);
    const cleanContent = removeSocialSnippetsSection(content);
    
    // Create slug from title
    const slug = title
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 50);
    
    // Format as Hugo post
    const date = new Date().toISOString().split('T')[0];
    const formattedContent = `---
title: "${title}"
date: ${date}
draft: false
tags: ["ai-generated", "${topic.toLowerCase()}"]
categories: ["ai-content"]
social_snippets:
${socialSnippets.map(snippet => `  - "${snippet}"`).join('\n')}
---

${cleanContent}
`;

    // Create file path for new post
    const filePath = `content/posts/${date}-${slug}.md`;
    
    // Encode content to base64
    const contentEncoded = Buffer.from(formattedContent).toString('base64');
    
    // Push to GitHub
    await octokit.repos.createOrUpdateFileContents({
      owner: GITHUB_USERNAME,
      repo: GITHUB_REPO,
      path: filePath,
      message: `Add post: ${title}`,
      content: contentEncoded,
      branch: GITHUB_BRANCH
    });
    
    res.json({
      success: true,
      message: "Content generated and published successfully",
      url: `https://${GITHUB_USERNAME}.github.io/${GITHUB_REPO}/posts/${slug}/`
    });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

function extractSocialSnippets(content) {
  // Simple extraction - this could be more sophisticated
  // Look for a section with social media snippets
  const snippetSection = content.match(/social media snippets:([\s\S]*?)(?=##|$)/i);
  
  if (snippetSection && snippetSection[1]) {
    return snippetSection[1]
      .split('\n')
      .filter(line => line.trim().startsWith('-'))
      .map(line => line.trim().substring(2).trim());
  }
  
  // If no explicit section, create basic ones
  return [
    `Check out our new post about ${title}!`,
    `New content available on our AI-generated blog.`,
    `Interested in ${topic}? Read our latest article!`,
    `Fresh content just published on our blog about ${topic}.`
  ];
}

function removeSocialSnippetsSection(content) {
  // Remove the social snippets section if it exists
  return content.replace(/## social media snippets:([\s\S]*?)(?=##|$)/i, '');
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
EOF
