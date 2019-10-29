pipeline {
	agent {
    kubernetes {
      label 'vscode'
      defaultContainer 'jnlp'
      yaml """
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: yarn-build
    image: jlarfors/vscode:latest
    command:
    - cat
    tty: true
"""
    }
  }
  stages {
    stage('Build') {
      steps {
        container('yarn-build') {
					sh '''
					apt-get update && apt-get install -y gulp
					yarn
					yarn compile
					'''
        }
      }
    }
		stage('Package') {
      steps {
        container('gulp') {
					sh 'gulp vscode-linux-x64'
        }
      }
    }
  }
}
